// Copyright 2017, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

process.env.DEBUG = 'actions-on-google:*';
const ApiAiApp = require('actions-on-google').ApiAiApp;
const express = require('express');
const bodyParser = require('body-parser');
const loadData = require('./zutils').loadData;
const runnerFactory = require('./zutils').runnerFactory;

const cmd = false;
const inputs = [];

// Example story: http://ifdb.tads.org/viewgame?id=mohwfk47yjzii14w
const story = 'http://mirror.ifarchive.org/if-archive/games/zcode/LostPig.z8';

// [START YourAction]
// Preload the story data before first action request
loadData(story, (data) => {
  console.log('preloaded data: ' + story);
});

const expressApp = express();
expressApp.set('port', (process.env.PORT || 8080));
expressApp.use(bodyParser.json({type: 'application/json'}));

expressApp.post('/', (request, response) => {
  const app = new ApiAiApp({request: request, response: response});
  console.log('Request headers: ' + JSON.stringify(request.headers));
  console.log('Request body: ' + JSON.stringify(response.body));
  const WELCOME_INTENT = 'input.welcome';
  const UNKNOWN_INTENT = 'input.unknown';
  const DIRECTION_INTENT = 'input.directions';
  const DIRECTION_ARGUMENT = 'Directions';
  const LOOK_INTENT = 'input.look';

  const runner = runnerFactory(story, app);
  if (runner === null) {
    throw new Error('Runner not found!');
  }

  const welcomeIntent = (app) => {
    console.log('welcomeIntent');
    runner.started = app.data.hasOwnProperty('restore');
    runner.start();
  };

  const unknownIntent = (app) => {
    console.log('unknownIntent: ' + app.getRawInput());
    if (app.getRawInput() === 'quit') {
      app.data.restore = null;
      app.tell('Goodbye!');
    } else {
      app.mappedInput = app.getRawInput();
      runner.start();
    }
  };

  const directionsIntent = (app) => {
    const direction = app.getArgument(DIRECTION_ARGUMENT);
    console.log('directionsIntent: ' + direction);
    app.mappedInput = 'go ' + direction;
    runner.start();
  };

  const lookIntent = (app) => {
    console.log('lookIntent');
    app.mappedInput = 'look';
    runner.start();
  };

  const actionMap = new Map();
  actionMap.set(WELCOME_INTENT, welcomeIntent);
  actionMap.set(UNKNOWN_INTENT, unknownIntent);
  actionMap.set(DIRECTION_INTENT, directionsIntent);
  actionMap.set(LOOK_INTENT, lookIntent);

  const url = request.query.url;
  if (url) {
    loadData(url, (data) => {
      console.log('custom data: ' + url);
      runner.run(() => {
        app.handleRequest(actionMap);
      });
    }, true);
  } else {
    runner.run(() => {
      app.handleRequest(actionMap);
    });
  }
});
// [END YourAction]

if (module === require.main) {
  // [START server]
  // Start the server
  const server = expressApp.listen(process.env.PORT || 8080, () => {
    const port = server.address().port;
    console.log('App listening on port %s', port);
  });
  // [END server]
}

module.exports = expressApp;
