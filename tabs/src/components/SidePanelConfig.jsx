import React from "react";
import "./App.css";
import { app, pages } from "@microsoft/teams-js";

// Tab configuration page
class SidePanelConfig extends React.Component {
  componentDidMount() {
    app.initialize().then(async () => {
      //  When the user clicks "Save", save the updated configuration
      pages.config.registerOnSaveHandler(async (saveEvent) => {
        const baseUrl = `https://${window.location.hostname}:${window.location.port}`;
        await pages.config.setConfig({
          suggestedDisplayName: "Balloon Bomb",
          entityId: "Balloon Bomb",
          contentUrl: baseUrl + "/index.html#/tab?inTeams=true",
          websiteUrl: baseUrl + "/index.html#/tab?inTeams=true",
        });
        saveEvent.notifySuccess();
      });

      // OK all set up, enable the "save" button
      pages.config.setValidityState(true);
    });
  }

  render() {
    return (
      <div>
        <h1>Balloon Bomb Introduction</h1>
        <div>
          <br />
          The game organizer,the meeting organizer, have the full privelege to control the game flow.
          Once people join the game, the game organizer can start the game by clicling 'set up game' button.
          Next, the game organizer sets the blow range (, beyond which the balloon blows up) and turn range (the range of the pumps that can be performed in a single turn).
          Once completed, the game starts, and players engage to play in turns.
          <br />
        </div>
      </div>
    );
  }
}

export default SidePanelConfig;
