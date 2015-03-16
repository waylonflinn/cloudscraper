var request      = require('request').defaults({jar: true}), // Cookies should be enabled
    util         = require('util'),
    UserAgent    = 'Ubuntu Chromium/34.0.1847.116 Chrome/34.0.1847.116 Safari/537.36';


var cloudscraper = function(url, options, callback){

  // use the built in request.initParams method to disambiguate arguments
  var params = request.initParams(uri, options, callback);

  params.options = addUserAgent(params.options);

  performRequest(params.uri, params.options, params.callback);
};

// this gives us access to the HTTP verbs as methods
util.inherits(cloudscraper, request);


/**
 * Add an acceptable user agent to the header options, if none has been
 * specified.
 * @param {[Object]} options
 */
function addUserAgent(options){

  options = options || {};


  //If no user-agent is passed, add one
  options.headers = options.headers || {};
  if (!options.headers['User-Agent']) {
    options.headers['User-Agent'] = UserAgent;
  }

  return options;
}

function performRequest(url, options, callback) {
  request(url, options, function(error, response, body) {
    var validationError;

    if (validationError = checkForErrors(error, body)) {
      return callback(validationError, body, response);
    }

    // If body contains specified string, solve challenge
    if (body.indexOf('a = document.getElementById(\'jschl-answer\');') !== -1) {
      return solveChallenge(response, body, callback);
    }

    // All is good
    callback(error, response, body);
  });
}

function checkForErrors(error, body) {
  var match;

  // Pure request error (bad connection, wrong url, etc)
  if(error) {
    return { errorType: 0, error: error };
  }

  // Finding captcha
  if (body.indexOf('why_captcha') !== -1 || /recaptcha/i.test(body)) {
    return { errorType: 1 };
  }

  // trying to find '<span class="cf-error-code">1006</span>'
  match = body.match(/<\w+\s+class="cf-error-code">(.*)<\/\w+>/i);

  if (match) {
    return { errorType: 2, error: parseInt(match[1]) };
  }

  return false;
}


function solveChallenge(response, body, callback) {
  var challenge = body.match(/name="jschl_vc" value="(\w+)"/),
      jsChlVc,
      answerResponse,
      answerUrl,
      host = response.request.host,
      headers = response.headers;

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract challengeId (jschl_vc) from page'}, body, response);
  }

  jsChlVc = challenge[1];

  challenge = body.match(/getElementById\('cf-content'\)[\s\S]+?setTimeout.+?\r?\n([\s\S]+?a\.value =.+?)\r?\n/i);

  if (!challenge) {
    return callback({errorType: 3, error: 'I cant extract method from setTimeOut wrapper'}, body, response);
  }

  challenge = challenge[1];

  challenge = challenge.replace(/a\.value =(.+?) \+ .+?;/i, '$1');

  challenge = challenge.replace(/\s{3,}[a-z](?: = |\.).+/g, '');

  try {
    answerResponse = { 'jschl_vc': jsChlVc, 'jschl_answer': (eval(challenge) + response.request.host.length) };
  } catch (err) {
    return callback({errorType: 3, error: 'Error occurred during evaluation: ' +  err.message}, body, response);
  }

  answerUrl = response.request.uri.protocol + '//' + host + '/cdn-cgi/l/chk_jschl';

  headers['Referer'] = response.request.uri.href; // Original url should be placed as referer

  // Make request with answer
  request.get({
    url: answerUrl,
    qs: answerResponse,
    headers: headers
  }, function(error, response, body) {
    callback(error, body, response);
  });
}

module.exports = cloudscraper;
