import {
  LiveShareClient,
  LivePresence,
  LiveEvent,
} from "@microsoft/live-share";
import { LiveShareHost } from "@microsoft/teams-js";
import { SharedMap } from "fluid-framework";
//import { LiveCanvas } from "@microsoft/live-share-canvas";

// interface IFluidService {
//     connect: () => void;                             // Connect to the Fluid service
//     addPerson: (name: string) => Promise<void>;      // Add a person to the list
//     removePerson: (name: string) => Promise<void>;   // Remove a person from the list
//     nextPerson: () => Promise<void>;                 // Go to next person
//     shuffle: () => Promise<void>;                    // Shuffle the list of speakers
//     getPersonList: () => Promise<string[]>;          // Get the current person list
//     // Event handler called when new person list is available
//     onNewData: (handler: (personList: string[]) => void) => void;
// }

class FluidService {
  // Constants
  #PERSON_VALUE_KEY = "person-value-key"; // Key for use in shared map
  #PUMP_VALUE_KEY = "pump-value-key";
  #BLOW_VALUE_KEY = "blow-value-key";
  #RESTART_VALUE_KEY = "restart-value-key";
  #APPSTATE_VALUE_KEY = "appState-value-key";
  // Service state
  #container; // Fluid container
  #peopleMap = { people: [] }; // Local array of people who will speak
  #pumpProxy = { pumpTriggerCount: [1, 10, 0] };
  #blowProxy = { blowsize: [10, 50, 20] };
  #restartProxy = { restartCount: 0, gameData: [] };
  // It contains multiple states: unsetup, setup, started, ended
  #appStateProxy = { appState: "unsetup" };

  #appStateRegisteredEventHandlers = []; // Array of event handlers to call when contents change
  #restartRegisteredEventHandlers = []; // Array of event handlers to call when contents change
  #pumpRegisteredEventHandlers = []; // Array of event handlers to call when contents change
  #blowRegisteredEventHandlers = []; // Array of event handlers to call when contents change
  #registeredEventHandlers = []; // Array of event handlers to call when contents change
  #connectPromise; // Singleton promise so we only connect once

  connect = () => {
    if (!this.#connectPromise) {
      this.#connectPromise = this.#connect();
    }

    return this.#connectPromise;
  };

  // Private function connects to the Fluid Relay service
  #connect = async () => {
    try {
      const liveShareHost = LiveShareHost.create();

      const liveShareClient = new LiveShareClient(liveShareHost);
      const { container } = await liveShareClient.joinContainer(
        // Container schema
        {
          initialObjects: {
            pumpMap: SharedMap,
            personMap: SharedMap,
            blowMap: SharedMap,
            restartMap: SharedMap,
            appStateMap: SharedMap,
            presence: LivePresence,
            notificationEvent: LiveEvent,
          },
        }
      );
      this.#container = container;
      // let initialList = require("../models/DiscussionList.json");

      const json =
        this.#container.initialObjects.personMap.get(this.#PERSON_VALUE_KEY) ||
        `{"people": []}`;
      this.#peopleMap = JSON.parse(json);

      this.#container.initialObjects.personMap.on("valueChanged", async () => {
        const json = this.#container.initialObjects.personMap.get(
          this.#PERSON_VALUE_KEY
        );
        this.#peopleMap = JSON.parse(json);
        for (let handler of this.#registeredEventHandlers) {
          await handler(this.#peopleMap);
        }
      });

      //-----------------PUMP-----------------

      const jsonPump =
        this.#container.initialObjects.pumpMap.get(this.#PUMP_VALUE_KEY) ||
        `{"pumpTriggerCount": [1,10,0]}`;
      this.#pumpProxy = JSON.parse(jsonPump);

      this.#container.initialObjects.pumpMap.on("valueChanged", async () => {
        const json = this.#container.initialObjects.pumpMap.get(
          this.#PUMP_VALUE_KEY
        );
        this.#pumpProxy = JSON.parse(json);
        for (let handler of this.#pumpRegisteredEventHandlers) {
          await handler(this.#pumpProxy);
        }
      });

      //-----------------BLOW-----------------
      const jsonBlow =
        this.#container.initialObjects.blowMap.get(this.#BLOW_VALUE_KEY) ||
        `{"blowsize": [10,50,20]}`;
      this.#blowProxy = JSON.parse(jsonBlow);
      this.#container.initialObjects.blowMap.on("valueChanged", async () => {
        const json = this.#container.initialObjects.blowMap.get(
          this.#BLOW_VALUE_KEY
        );
        this.#blowProxy = JSON.parse(json);
        for (let handler of this.#blowRegisteredEventHandlers) {
          await handler(this.#blowProxy);
        }
      });

      //-----------------RESTART-----------------
      const jsonRestart =
        this.#container.initialObjects.restartMap.get(
          this.#RESTART_VALUE_KEY
        ) || `{"restart": 0, "gameData": []}`;
      this.#restartProxy = JSON.parse(jsonRestart);
      this.#container.initialObjects.restartMap.on("valueChanged", async () => {
        const json = this.#container.initialObjects.restartMap.get(
          this.#RESTART_VALUE_KEY
        );
        this.#restartProxy = JSON.parse(json);
        for (let handler of this.#restartRegisteredEventHandlers) {
          await handler(this.#restartProxy);
        }
      });

      //-----------------APPSTATE-----------------
      const jsonAppState =
        this.#container.initialObjects.appStateMap.get(
          this.#APPSTATE_VALUE_KEY
        ) || `{"appState": "unsetup"}`;
      this.#appStateProxy = JSON.parse(jsonAppState);
      this.#container.initialObjects.appStateMap.on(
        "valueChanged",
        async () => {
          const json = this.#container.initialObjects.appStateMap.get(
            this.#APPSTATE_VALUE_KEY
          );
          this.#appStateProxy = JSON.parse(json);
          for (let handler of this.#appStateRegisteredEventHandlers) {
            await handler(this.#appStateProxy);
          }
        }
      );
    } catch (error) {
      console.log(`Error in fluid service: ${error.message}`);
      throw error;
    }
  };

  // Private function to update the Fluid relay from the local array of people
  #updateFluid = async () => {
    const json = JSON.stringify(this.#peopleMap);
    this.#container.initialObjects.personMap.set(this.#PERSON_VALUE_KEY, json);
  };

  #updateFluidPump = async () => {
    const json = JSON.stringify(this.#pumpProxy);
    this.#container.initialObjects.pumpMap.set(this.#PUMP_VALUE_KEY, json);
  };

  #updateFluidBlow = async () => {
    const json = JSON.stringify(this.#blowProxy);
    this.#container.initialObjects.blowMap.set(this.#BLOW_VALUE_KEY, json);
  };

  #updateFluidRestart = async () => {
    const json = JSON.stringify(this.#restartProxy);
    this.#container.initialObjects.restartMap.set(
      this.#RESTART_VALUE_KEY,
      json
    );
  };

  #updateFluidAppState = async () => {
    const json = JSON.stringify(this.#appStateProxy);
    this.#container.initialObjects.appStateMap.set(
      this.#APPSTATE_VALUE_KEY,
      json
    );
  };

  reorderPeople = async (people, oldPos, newPos) => {
    people.splice(newPos, 0, people.splice(oldPos, 1)[0]);
    this.#peopleMap.people = people;
    await this.#updateFluid();
  };

  // Public functions used by the UI
  addPerson = async (name, id) => {
    if (!name) {
      throw new Error(`Please enter a name to add to the list`);
    }
    if (!this.#peopleMap.people) {
      this.#peopleMap.people = [];
    }
    let patient = this.#peopleMap.people.filter(
      (item) => item.name === name && item.id === id
    );
    if (patient && patient.length > 0) {
      throw new Error(`${name} is already on the list`);
    }
    this.#peopleMap.people.push({
      name: name,
      id: id,
      data: 0,
    });
    await this.#updateFluid();
  };

  removePerson = async (id) => {
    //if (this.#people.includes(name)) {
    this.#peopleMap.people = this.#peopleMap.people.filter(
      (item) => item.id !== id
    );
    //}
    await this.#updateFluid();
  };

  nextPerson = async () => {
    const firstPerson = this.#peopleMap.people[0];
    this.#peopleMap.people.shift();
    this.#peopleMap.people.push(firstPerson);
    await this.#updateFluid();
    this.#pumpProxy.pumpTriggerCount[2] = 0;
    await this.#updateFluidPump();
  };

  increaseData = async (id) => {
    if (!id) {
      throw new Error(`Please provide both name and id`);
    }

    // Ensure the peopleMap array is initialized
    if (!this.#peopleMap.people || this.#peopleMap.people.length === 0) {
      throw new Error(`There are no people in the list`);
    }

    // Check if the person is the first in the list
    if (this.#peopleMap.people[0].id !== id) {
      throw new Error(`You are not in control`);
    }

    // Increase the person's data
    this.#peopleMap.people[0].data += 1;
    await this.#updateFluid();
    this.#pumpProxy.pumpTriggerCount[2] += 1;
    await this.#updateFluidPump();
  };

  setBlowSize = async (size) => {
    if (!size) {
      throw new Error(`Please provide a valid range`);
    }
    this.#blowProxy.blowsize = size;
    await this.#updateFluidBlow();
  };

  setPlayerRange = async (range) => {
    if (!range) {
      throw new Error(`Please provide a valid range`);
    }
    this.#pumpProxy.pumpTriggerCount = range;
    await this.#updateFluidPump();
  };

  restartGame = async () => {
    const gameData = [];

    // Iterate through the people, accumulating scores or creating new entries
    this.#peopleMap.people.forEach((person) => {
      // Check if an entry for the person's name already exists in the gameData
      const existingEntry = gameData.find(
        (entry) => entry[person.name] !== undefined
      );

      if (existingEntry) {
        // Add to the existing score
        existingEntry[person.name] += person.data;
      } else {
        // Create a new entry for this name
        gameData.push({ [person.name]: person.data });
      }

      // Reset the person's data for the next game
      person.data = 0;
    });

    // Update the restartProxy with the new restart count and game data
    this.#restartProxy.restartCount += 1;
    this.#restartProxy.gameData = gameData;

    // Update the Fluid restart object
    await this.#updateFluidRestart();

    // Update the people's data in Fluid
    await this.#updateFluid();
  };

  setAppState = async (state) => {
    if (!state) {
      throw new Error(`Please provide a state`);
    }
    this.#appStateProxy.appState = state;
    await this.#updateFluidAppState();
  };

  exportHealthData = () => {
    // Copy the current gameData
    const gameData = [...this.#restartProxy.gameData];

    // Iterate through the people, accumulating scores or creating new entries
    this.#peopleMap.people.forEach((person) => {
      // Check if an entry for the person's name already exists in the gameData
      const existingEntry = gameData.find(
        (entry) => entry[person.name] !== undefined
      );

      if (existingEntry) {
        // Add to the existing score
        existingEntry[person.name] += person.data;
      } else {
        // Create a new entry for this name
        gameData.push({ [person.name]: person.data });
      }
    });

    return JSON.stringify(gameData);
  };

  shuffle = async () => {
    // Use the Fischer-Yates algorithm
    for (let i = this.#peopleMap.people.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * i);
      [this.#peopleMap.people[i], this.#peopleMap.people[j]] = [
        this.#peopleMap.people[j],
        this.#peopleMap.people[i],
      ];
    }
    await this.#updateFluid();
  };

  getPersonList = async () => {
    return this.#peopleMap;
  };

  getPlayerRange = async () => {
    return this.#pumpProxy;
  };

  getAppState = async () => {
    return this.#appStateProxy;
  };

  getPresence = async () => {
    return this.#container.initialObjects.presence;
  };

  onNewData = (e) => {
    this.#registeredEventHandlers.push(e);
  };

  onNewPumpData = (e) => {
    this.#pumpRegisteredEventHandlers.push(e);
  };

  onNewBlowData = (e) => {
    this.#blowRegisteredEventHandlers.push(e);
  };

  onNewRestartData = (e) => {
    this.#restartRegisteredEventHandlers.push(e);
  };

  onNewAppStateData = (e) => {
    this.#appStateRegisteredEventHandlers.push(e);
  };

  reset = async () => {
    // Resetting people list
    this.#peopleMap = { people: [] };

    // Resetting pump proxy
    this.#pumpProxy = { pumpTriggerCount: [1, 10, 0] };

    // Resetting blow proxy
    this.#blowProxy = { blowsize: [10, 50, 20] };

    // Resetting restart proxy
    this.#restartProxy = { restartCount: 0, gameData: [] };

    // Resetting app state
    this.#appStateProxy = { appState: "unsetup" };

    // Update Fluid data for each of the reset properties
    await Promise.all([
      this.#updateFluid(),
      this.#updateFluidPump(),
      this.#updateFluidBlow(),
      this.#updateFluidRestart(),
      this.#updateFluidAppState(),
    ]);

    for (let handler of this.#appStateRegisteredEventHandlers) {
      await handler(this.#appStateProxy);
    }
  };

  getLiveEvents = () => {
    if (!this.#container) {
      // Handle the case where container is not yet defined
      // You might throw an error, return a default value, or something else appropriate for your application
      throw new Error(
        "Container not initialized. Ensure connect() is called before accessing live events."
      );
    }
    return this.#container.initialObjects.notificationEvent;
  };
  
}
export default new FluidService();
