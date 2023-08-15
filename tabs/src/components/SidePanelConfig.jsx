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
        <h1>Tab Configuration</h1>
        <div>
          <br />
          The configuration options for the balloon bomb game is available while you start the game. Please
          click "Save" to continue.
          <br />
        </div>
      </div>
    );
  }
}

export default SidePanelConfig;
