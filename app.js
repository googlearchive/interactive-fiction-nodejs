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
const Assistant = require('actions-on-google').ApiAiAssistant;
const express = require('express');
const bodyParser = require('body-parser');
const loadData = require('./zutils').loadData;
const runnerFactory = require('./zutils').runnerFactory;

const cmd = false;
const inputs = [];

// Example story: http://ifdb.tads.org/viewgame?id=op0uw1gn1tjqmjt7
const story = 'http://ifarchive.org/if-archive/games/zcode/anchor.z8';

const YES = 'y';
const NO_INPUTS = ['I didn\'t hear that.', 'If you\'re still there, please repeat that.', 'See you next time.'];

// [START YourAction]
// Preload the story data before first action request
loadData(story, (data) => {
  console.log('preloaded data: ' + story);
});

const app = express();
app.set('port', (process.env.PORT || 8080));
app.use(bodyParser.json({type: 'application/json'}));

app.post('/', (request, response) => {
  const assistant = new Assistant({request: request, response: response});
  console.log('Request headers: ' + JSON.stringify(request.headers));
  console.log('Request body: ' + JSON.stringify(response.body));
  const WELCOME_INTENT = 'input.welcome';
  const UNKNOWN_INTENT = 'input.unknown';
  const DIRECTION_INTENT = 'input.directions';
  const DIRECTION_ARGUMENT = 'Directions';
  const LOOK_INTENT = 'input.look';

  const runner = runnerFactory(story, assistant);
  if (runner === null) {
    throw new Error('Runner not found!');
  }

  const welcomeIntent = (assistant) => {
    console.log('welcomeIntent');
    runner.started = assistant.data.hasOwnProperty('restore');
    runner.start();
  };

  const unknownIntent = (assistant) => {
    console.log('unknownIntent: ' + assistant.getRawInput());
    if (assistant.getRawInput() === 'quit') {
      assistant.data.restore = null;
      assistant.tell('Goodbye!');
    } else {
      assistant.mappedInput = assistant.getRawInput();
      runner.start();
    }
  };

  const directionsIntent = (assistant) => {
    console.log('directionsIntent');
    const direction = assistant.getArgument(DIRECTION_ARGUMENT);
    console.log('directionsIntent: ' + direction);
    assistant.mappedInput = 'go ' + direction;
    runner.start();
  };

  const lookIntent = (assistant) => {
    console.log('lookIntent');
    assistant.mappedInput = 'look';
    runner.start();
  };

  const actionMap = new Map();
  actionMap.set(WELCOME_INTENT, welcomeIntent);
  actionMap.set(UNKNOWN_INTENT, unknownIntent);
  actionMap.set(DIRECTION_INTENT, directionsIntent);
  actionMap.set(LOOK_INTENT, lookIntent);

  runner.run(() => {
    assistant.handleRequest(actionMap);
  });
});
// [END YourAction]

if (module === require.main) {
  // [START server]
  // Start the server
  const server = app.listen(process.env.PORT || 8080, () => {
    const port = server.address().port;
    console.log('App listening on port %s', port);
  });
  // [END server]
}

module.exports = app;
