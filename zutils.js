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

/*
Copyright (c) 2013 The ifvms.js team
MIT licenced
http://github.com/curiousdannii/ifvms.js
*/

'use strict';

const fs = require('fs');
const iconv = require('iconv-lite');
const inquirer = require('inquirer');
const request = require('request');
const ZVM = require('./zvm.js');

const cmd = false;
const inputs = [];
const YES = 'y';
const NO_INPUTS = ['I didn\'t hear that.', 'If you\'re still there, please repeat that.', 'See you next time.'];
const HELP = 'You can say things like go, inventory or examine. What do you want to do?';

// Cache the story data
let storyData = null;

// Get a runner for the story file
const runnerFactory = (story, assistant) => {
  // Validate the extension
  if (/(z[58]|zlb|(z|zcode.+)(blorb|blb))(.js)?$/i.test(story)) {
    return new ZvmRunner(story, assistant);
  }
  return null;
}

// Utility from ZVM bootstrap to convert text into an array
const textToArray = (text, array) => {
  let i = 0;
  let l;
  array = array || [];
  for (l = text.length % 8; i < l; ++i) {
    array.push(text.charCodeAt(i));
  }
  for (l = text.length; i < l;) {
    // Unfortunately unless text is cast to a String object there is no shortcut for charCodeAt,
    // and if text is cast to a String object, it's considerably slower.
    array.push(text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++),
      text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++), text.charCodeAt(i++));
  }
  return array;
};

// Load the story file from a URL or a local file
const loadData = (story, callback, reload) => {
  console.log('loadData: ' + story);
  if (!reload && storyData) {
    console.log('loadData: cached');
    callback(storyData);
    return;
  }
  if (story.startsWith('http')) {
    request.get({url: story, encoding: null}, function (error, response, body) {
      if (error) {
        console.log('Error loading file: ' + story);
        return;
      }
      console.log('Loaded file: ' + story);

      storyData = textToArray(iconv.decode(body, 'latin1'));
      callback(storyData);
    });
  } else {
    // or load story file from local file system
    fs.readFile(this.story, function (error, file) {
      if (error) {
        console.log('Error loading file: ' + story);
        return;
      }
      console.log('Loaded file: ' + story);

      storyData = textToArray(iconv.decode(file, 'latin1'));
      callback(storyData);
    });
  }
};

/*
 * Class to run the story
 * Note: Contains logic to handle the various z-code constructs which is not related
 * to actions and don't need to be understood for playing the game.
 */
class ZvmRunner {

  constructor (story, assistant) {
    this.story = story;
    this.assistant = assistant;
    this.engine = new ZVM();
    this.data = null;
    this.lastAnswer = null;
    this.restoring = false;
    this.restarting = false;
    this.started = true;
    this.lastReadOrder = null;
  }

  run (callback) {
    const engine = this.engine;
    const self = this;

    this.title = null;
    this.subtitle = null;
    this.description = null;
    this.saving = false;

    loadData(this.story, (data) => {
      self.sendInput({
        code: 'load',
        data: data
      });
      try {
        engine.restart();
      } catch (e) {
        self.assistant.tell('Error: File format not supported.');
        return;
      }

      console.log('Loaded into engine: ' + self.story);
      engine.run();
      if (cmd) {
        self.restart();
      }
      callback();
    });
  }

  step () {
    console.log('step: ' + this.started);
    const engine = this.engine;
    const self = this;
    const orders = engine.orders;
    let retval = 0;
    let order;
    let code;
    let i;
    this.started = this.assistant.data.hasOwnProperty('restore');

      // Process the orders
    for (i = 0; i < orders.length; i++) {
      order = orders[i];
      console.log(JSON.stringify(order));
      code = order.code;
      console.log('code: ' + code);

      if (code === 'quit') {
        return;
      } else if (code === 'char') {
        // Simulate the user pressing yes confirmation
        // for initial intro screens
        if (!this.started) {
          console.log('say y');
          order.response = YES;
          self.sendInput(order);
          this.description = null;
        } else {
          if (!cmd) {
            console.log('say y');
            order.response = YES;
            self.sendInput(order);
            return 0;
          } else {
            this.input((response) => {
              order.response = response;
              self.sendInput(order);
            });
          }
          return 1;
        }
      } else if (code === 'stream') {
          // Skip status line updates
        if (order.name === 'status') {
          continue;
        }

        let text = order.text;
        if (text) {
          console.log('started=' + this.started);
          // Extract the story title, subtitle and description
          if (!this.started && order.props && Object.keys(order.props).length > 0) {
            if (!(this.saving || this.restoring)) {
              if (!this.title && text && text.trim().length > 0) {
                if (text.charAt(0) === ' ' && text.charAt(3) === ' ' && text.charAt(5) === ' ') {
                  text = text.replace(/ /g, '');
                }
                this.title = text.replace(/['"]+/g, '').replace(/(\r\n|\n|\r)/gm, '').toLowerCase();
                console.log('found title: ' + this.title);
                this.description = null;
              } else if (text && text.trim().length > 0) {
                this.subtitle = text.trim();
                console.log('found subtitle: ' + this.subtitle);
                this.description = null;
              }
            }
          } else if (!(this.saving || this.restoring)) {
            // Ignore commands initiated by runner like simulating save and restore
            if (this.lastAnswer && text.replace(/(\r\n|\n|\r)/gm, '') === this.lastAnswer) {
              continue;
            }
            if (this.lastAnswer && text.startsWith(this.lastAnswer + '\r')) {
              text = text.substring(this.lastAnswer.length + 1);
            }
            const description = text.trim();
            if (description.length > 0) {
              this.setDescription(description);
            }
          }
        }
      } else if (code === 'read') {
        this.lastReadOrder = JSON.parse(JSON.stringify(order));
        if (inputs.length > 0) {
          const response = inputs.shift();
          console.log('response: ' + response);
          order.response = response;
          self.sendInput(order);
          this.description = null;
          this.lastAnswer = response;
        } else {
          if (!this.started) {
            console.log('title: ' + this.title);
            console.log('subtitle: ' + this.subtitle);
          }
          console.log('description: ' + this.description);
          if (!cmd) {
            let response = '';
            if (this.description) {
              response = this.description;
            }
            if (!this.started) {
              if (this.subtitle) {
                response = this.subtitle + '. ' + response;
              }
              if (this.title) {
                response = 'Welcome to your voice adventure called ' + this.title + '. ' + response + ' ' + HELP;
              }
            }
            if (this.restarting) {
              this.restarting = false;
              this.started = false;
              order.response = 'yes';
              self.sendInput(order);
              continue;
            } else if (this.restoring) {
              this.restoring = false;
              const answer = this.assistant.mappedInput ? this.assistant.mappedInput : this.assistant.getRawInput();
              console.log('answer: ' + answer);
              this.setAnswer(answer);
              continue;
            } else if (this.saving) {
              this.saving = false;
              if (this.data) {
                this.assistant.data.restore = this.data;
              }
              if (this.assistant.getApiVersion) {
                this.assistant.ask(this.assistant.buildInputPrompt(false, response, NO_INPUTS));
              } else {
                this.assistant.ask(response, NO_INPUTS);
              }
            } else {
                // Persist state for each request
              this.saving = true;
              this.saveGame();
              continue;
            }
          } else {
            this.input((response) => {
              console.log('say: ' + response);
              self.lastAnswer = response;
              order.response = response;
              self.sendInput(order);
            });
          }
          this.started = true;
          this.description = null;
          return 1;
        }
      } else if (code === 'find') {
        // ignore
        continue;
      } else if (code === 'structures') {
        // ignore
        continue;
      } else if (code === 'save') {
        console.log('save: ' + order.data);
        this.data = order.data;
        self.sendInput(order);
      } else if (code === 'restore') {
        console.log('restore: ' + this.data);
        if (this.data) {
          order.data = this.data;
          self.sendInput(order);
        }
      } else if (code === 'restart') {
        console.log('restart');
        self.sendInput(order);
        this.started = false;
      } else {
        console.log('ignore: ' + code);
      }
    }
    return retval;
  }

  setAnswer (answer) {
    this.lastAnswer = answer;
    this.sendInput(this.createOrder(answer));
  }

  setData (data) {
    if (data) {
      this.data = data;
      this.restoring = true;
      this.restoreGame();
    }
  }

  setDescription (text) {
    if (text && text.trim().length > 1) {
        // remove whitespace and line breaks
      let description = text.replace(/(\r\n|\n|\r)/gm, ' ').trim();
        // remove quotes
      description = description.replace(/['"]+/g, '');
      if (description.endsWith('>')) {
          // remove '>' at end of string
        description = description.substring(0, description.length - 1).trim();
      }
      if (!description.endsWith('.')) {
        description = description + '.';
      }
        // combine with previous description
      if (this.description) {
        this.description = this.description + ' ' + description;
      } else {
        this.description = description;
      }
      console.log('found description: ' + this.description);
    }
  }

  saveGame () {
    console.log('saveGame');
    this.sendInput(this.createOrder('save'));
  }

  restoreGame () {
    console.log('restoreGame');
    this.sendInput({'storer': 255, 'code': 'restore', 'data': this.data});
  }

  restartGame () {
    console.log('restartGame');
    this.sendInput(this.createOrder('restart'));
  }

  start () {
    this.setData(this.assistant.data.restore);
    this.restart();
  }

  restart () {
    while (this.step() === 0) {}
  }

  input (callback) {
    console.log('input');
    const self = this;
    const p = {
      type: 'input',
      name: 'input',
      message: '>'
    };
    inquirer.prompt([p]).then((response) => {
      console.log('response: ' + response.input);
      callback(response.input);
      self.restart();
    });
  }

  sendInput (order) {
    if (order.code !== 'load') {
      console.log(JSON.stringify(order));
    } else {
      console.log('{"code":"load","data":[...]}');
    }
    this.engine.inputEvent(order);
  }

  createOrder (response) {
    this.lastReadOrder.response = response;
    return this.lastReadOrder;
  }
}

module.exports = {
  ZvmRunner: ZvmRunner,
  loadData: loadData,
  runnerFactory: runnerFactory
};