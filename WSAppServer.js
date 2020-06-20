import { intentsJSONWithValues } from './IntentsJSONGenerator.js';
import { Client } from 'pia/client/Client.js';
import { getConfig } from 'pia/util/config.js';
import { assert } from 'pia/util/util.js';
import { WSCall } from 'pia/client/wsapp/WSCall.js';
import WebSocket from 'ws';

/**
 * Wraps a Pia voice app as a WebSocket client.
 * We will connect to Pia core over a WebSocket,
 * register our app, and then wait for calls from the core
 * to the intents.
 *
 * Reads the basic intents and commands from a JSON file.
 * Then loads the app and lets it add the available values
 * for each type.
 * Then we register our app with the Pia core.
 */
export default class WSAppServer {
  constructor(apps) {
    assert(apps.length, "Need array of apps");
    apps.forEach(app => assert(app.intents, "App has wrong type"));
    this.apps = apps; // {Array of AppBase}
    this._client = null; // {Client}
    //this._wsCall = null; // {WSCall} connection with Pia core
  }

  async start() {
    let wsCall = await this._connect();

    this._client = new Client();
    await this._client.loadApps(this.apps, "en");

    for (let app of this.apps) {
      await this._registerAppWithCore(app, wsCall);
    }
    console.log("Started and registered");
  }

  async _connect() {
    let coreURL = getConfig().coreURL || kCoreURL;
    return new Promise((resolve, reject) => {
      // Open network connection to WebSocket server = Pia core
      let webSocket = new WebSocket(coreURL);
      webSocket.on("open", () => {
        let wsCall = new WSCall(webSocket);
        resolve(wsCall);
      });
    });
  }

  /**
   * Notify the Pia core of us
   * @param app {AppBase} our app
   * @param wsCall {WSCall} connection with Pia core
   */
  async _registerAppWithCore(app, wsCall) {
    await wsCall.makeCall("register", intentsJSONWithValues(app));

    // Register the handler for each intent
    for (let intent of Object.values(app.intents)) {
      assert(intent.parameters, "Intent has wrong type");
      wsCall.register(app.id + "/" + intent.id, async call => await this.intentCall(intent, call));
    }
  }

  /**
   * The user invoked an intent command and the
   * Pia core called us to run the intent.
   *
   * Map from WebSocket/WSCall and JSON to intent call.
   *
   * @param intent {Intent}
   * @param call {
   *     lang: {string} 2 letter ISO code for language
   *     args: {
   *       <slotname>: <value>,
   *       ...
   *     }
   *   }
   * @see WSApp.js for the WebSocket server = Pia core
   */
  async intentCall(intent, call) {
    // TODO map back NamedValues from term to value
    // TODO sanitize and security-check the arguments
    console.log("intent", intent.id, "called with args", call.args);

    this._client.lang = call.lang || "en";
    // TODO due to async, another call can overwrite lang again.
    // Need to make a new ClientAPI or Client object.

    let response = await intent.run(call.args, this._client.clientAPI);
    return { responseText: response };
  }
}
