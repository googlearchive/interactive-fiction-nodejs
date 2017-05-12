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
const ActionsSdkApp = require('actions-on-google').ActionsSdkApp;
const express = require('express');
const bodyParser = require('body-parser');
const loadData = require('./zutils').loadData;
const runnerFactory = require('./zutils').runnerFactory;

// Example story: http://ifdb.tads.org/viewgame?id=mohwfk47yjzii14w
const story = 'http://mirror.ifarchive.org/if-archive/games/zcode/LostPig.z8';

const NO_INPUTS = ['I didn\'t hear that.', 'If you\'re still there, please repeat that.', 'See you next time.'];

// [START YourAction]
// Preload the story data before first action request
loadData(story, (data) => {
  console.log('preloaded data: ' + story);
});

const expressApp = express();
expressApp.set('port', (process.env.PORT || 8080));
expressApp.use(bodyParser.json({type: 'application/json'}));

expressApp.post('/', (request, response) => {
  console.log('handle post');
  const app = new ActionsSdkApp({request: request, response: response});

  const runner = runnerFactory(story, app);
  if (runner === null) {
    throw new Error('Runner not found!');
  }

  function mainIntent (app) {
    console.log('mainIntent');
    runner.started = app.data.hasOwnProperty('restore');
    runner.start();
  }

  function rawInput (app) {
    console.log('rawInput');
    if (app.getRawInput() === 'quit') {
      app.tell('Goodbye!');
    } else {
      app.mappedInput = app.getRawInput();
      runner.start();
    }
  }

  const actionMap = new Map();
  actionMap.set(app.StandardIntents.MAIN, mainIntent);
  actionMap.set(app.StandardIntents.TEXT, rawInput);

  runner.run(() => {
    app.handleRequest(actionMap);
  });
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

