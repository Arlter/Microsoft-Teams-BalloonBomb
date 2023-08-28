import React from "react";
import { useEffect, useState, useCallback } from "react";
import { app, FrameContexts } from "@microsoft/teams-js";
import { UserMeetingRole } from "@microsoft/live-share";
import "./SidePanel.scss";
import FluidService from "../services/fluidLiveShare.js";
import { meeting } from "@microsoft/teams-js";
import { inTeams } from "../utils/inTeams.js";
import * as liveShareHooks from "../live-share-hooks";
import { initializeIcons } from "@fluentui/font-icons-mdl2";
import { FontIcon, TooltipHost, PrimaryButton } from "@fluentui/react";
import { Draggable } from "react-drag-reorder";
import fluidLiveShare from "../services/fluidLiveShare.js";
import { saveAs } from "file-saver";

export const SidePanel = (presence) => {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Connecting to Fluid service...");
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [people, setPeople] = useState([]);
  const [playerRange, setPlayerRange] = useState([]);
  const ALLOWED_ROLES = [UserMeetingRole.organizer, UserMeetingRole.presenter];
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [appState, setAppState] = useState("unsetup");

  const initialize = async () => {
    app.initialize().then(async () => {
      try {
        const context = await app.getContext();
        const userName = context?.user?.userPrincipalName.split("@")[0];
        const userId = context?.user?.id;
        // Ensure we're running in a side panel
        if (context.page.frameContext !== FrameContexts.sidePanel) {
          setReady(false);
          setMessage(
            "This tab only works in the side panel of a Teams meeting. Please join the meeting to use it."
          );
          return;
        }

        // Attempt to connect to the Fluid relay service
        await FluidService.connect();
        const people = await FluidService.getPersonList();
        setReady(true);
        setMessage("");
        setUserName(userName);
        setUserId(userId);
        setPeople(people.people);
        const playerRange = await FluidService.getPlayerRange();
        setPlayerRange(playerRange.pumpTriggerCount);
        const appState = await FluidService.getAppState();
        setAppState(appState.appState);

        // Register an event handler to update state when fluid data changes
        FluidService.onNewData((people) => {
          setReady(true);
          setPeople(null);
          setPeople(people.people);
          setMessage("");
        });

        FluidService.onNewPumpData((pumpData) => {
          setPlayerRange(pumpData.pumpTriggerCount);
        });

        FluidService.onNewAppStateData((appState) => {
          setAppState(appState.appState);
        });

        initializeIcons();
        //shareToStage();
      } catch (error) {
        // Display any errors encountered while connecting to Fluid service
        setReady(false);
        setMessage(`ERROR: ${error.message}`);
      }
    });
  };

  const {
    //presenceStarted, // boolean that is true once presence.initialize() is called
    users, // user presence array
    localUserIsEligiblePresenter, // boolean that is true if local user is in one of the allowed roles
  } = liveShareHooks.usePresence(presence, ALLOWED_ROLES);

  useEffect(() => {
    initialize();
  }, []);

  const findUserById = (users, userId) => {
    return users.find((user) => user.userId === userId);
  };

  useEffect(() => {
    const localUserInUsers = findUserById(users, userId);
    const isUserOrganizer = localUserInUsers?.roles.includes(
      UserMeetingRole.organizer
    );
    setIsOrganizer(isUserOrganizer);

    if (isUserOrganizer) {
      (async () => {
        try {
          await FluidService.addPerson(userName, userId);
          setMessage("");
        } catch (error) {
          setMessage(error.message);
          setTimeout(() => {
            setMessage("");
          }, 3000);
        }
      })();
    }
  }, [users, userId, userName]);

  const isCurrentUserFirst = () => {
    return people.length > 0 && people[0].id === userId;
  };

  const shareToStage = () => {
    if (inTeams()) {
      meeting.shareAppContentToStage((error, result) => {
        if (!error) {
          //console.log("Started sharing to stage");
        } else {
          //console.warn("shareAppContentToStage failed", error);
        }
      }, window.location.origin + "?inTeams=1&view=stage");
    }
  };

  const getChangedPos = useCallback(
    (currentPos, newPos) => {
      fluidLiveShare.reorderPeople(people, currentPos, newPos);
    },
    [people]
  );

  const DraggableRender = useCallback(() => {
    if (people && people.length) {
      if (!isOrganizer) {
        return (
          <div>
            {people.map((item, index) => (
              <span
                style={{
                  display: "flex",
                  width: "200px",
                  borderLeft: `4px solid ${index > 0 ? "orange" : "green"}`,
                  borderRadius: "0px",
                }}
                key={index}
                className="list-item"
              >
                {item.name}
                {item.id === userId &&
                  (appState === "unsetup" || appState === "started") && (
                    <FontIcon
                      iconName="Delete"
                      className="close"
                      onClick={async () => {
                        await FluidService.removePerson(item.id);
                      }}
                    />
                  )}
              </span>
            ))}
          </div>
        );
      }
  
      return (
        <Draggable onPosChange={getChangedPos}>
          {people.map((item, index) => (
            <span
              style={{
                display: "flex",
                width: "200px",
                borderLeft: `4px solid ${index > 0 ? "orange" : "green"}`,
                borderRadius: "0px",
              }}
              key={index}
              className="list-item"
            >
              {item.name}
              {(item.id !== userId || !isOrganizer) && (
                <FontIcon
                  iconName="Delete"
                  className="close"
                  onClick={async () => {
                    await FluidService.removePerson(item.id);
                  }}
                />
              )}
            </span>
          ))}
        </Draggable>
      );
    }
    return null;
  }, [people, getChangedPos, isOrganizer, appState, userId]);
  

  const resetGame = async () => {
    meeting.stopSharingAppContentToStage((error, result) => {
      if (!error) {
        //console.log("Stopped sharing to stage");
      } else {
        console.warn("stopSharingAppContentToStage failed", error);
      }
    });
    await FluidService.reset();
    await initialize();
  };

  const exportHealthData = async () => {
    const data = FluidService.exportHealthData();

    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    saveAs(blob, "healthdata.json");
  };

  const isNextGamerButtonEnabled = () => {
    return (
      playerRange.length >= 3 &&
      playerRange[2] >= playerRange[0] &&
      playerRange[2] <= playerRange[1]
    );
  };

  const handleKeyDown = useCallback(
    (event) => {
      if (
        event.keyCode === 39 &&
        appState !== "unsetup" &&
        appState !== "setup" &&
        appState !== "ended" &&
        people.length > 1 &&
        localUserIsEligiblePresenter &&
        isCurrentUserFirst() &&
        isNextGamerButtonEnabled()
      ) {
        FluidService.nextPerson();
      }
    },
    [
      appState,
      people,
      localUserIsEligiblePresenter,
      isCurrentUserFirst,
      isNextGamerButtonEnabled,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!ready) {
    // We're not ready so just display the message
    return (
      <div>
        {/* Heading */}
        <h1>Ballon Bomb</h1>
        <br />

        {/* Message */}
        <div className="message">{message}</div>
      </div>
    );
  } else {
    // We're ready; render the whole UI
    return (
      <div className="speaker-list">
        {/* Heading */}
        <h1 className="balloon-bomb-title">Balloon Bomb</h1>

        {appState != "unsetup" && people && people.length > 0 && (
          <div className="speaker-box">
            <h2>Current Gamer:</h2>
            <h1 className="reveal-text">{people[0].name}</h1>
          </div>
        )}

        {/* List heading */}
        {people && people.length > 0 && (
          <hr style={{ width: "100%", margin: "10px 0" }} />
        )}

        {(appState == "unsetup" || appState == "ended") &&
          localUserIsEligiblePresenter && (
            <>
              <div className="add-name">
                <div className="center-content">
                  <button
                    type="submit"
                    className="addbutton"
                    onClick={async () => {
                      try {
                        await FluidService.addPerson(userName, userId);
                        setMessage("");
                      } catch (error) {
                        setMessage(error.message);
                        setTimeout(() => {
                          setMessage("");
                        }, 3000);
                      }
                    }}
                  >
                    <FontIcon iconName="Add" style={{ marginRight: "10px" }} />
                    Join the game
                  </button>
                </div>
                <div className="message">{message}</div>
              </div>
            </>
          )}

        <div className="display-list">
          {people && people.length > 0 && (
            <div>
              <div className="people-list ">
                {/* List of people waiting to speak  */}
                {<DraggableRender />}
              </div>
            </div>
          )}
        </div>

        {appState != "unsetup" &&
          appState != "setup" &&
          appState != "ended" &&
          people.length > 1 &&
          localUserIsEligiblePresenter && (
            /* Who's next button */
            <div>
              <PrimaryButton
                iconProps={{ iconName: "Next" }}
                onClick={async () => {
                  await FluidService.nextPerson();
                }}
                disabled={!isCurrentUserFirst() || !isNextGamerButtonEnabled()}
              >
                Next Gamer
              </PrimaryButton>
            </div>
          )}

        {people &&
          people.length > 0 &&
          appState == "unsetup" &&
          localUserIsEligiblePresenter &&
          isOrganizer && (
            /* Shuffle button */
            <>
              <p>
                <PrimaryButton
                  iconProps={{ iconName: "ShareiOS" }}
                  onClick={() => {
                    shareToStage();
                    FluidService.setAppState("setup");
                  }}
                >
                  Set Up Game
                </PrimaryButton>
              </p>
            </>
          )}

        {appState !== "unsetup" &&
          isOrganizer &&
          localUserIsEligiblePresenter && (
            <p>
              <PrimaryButton
                iconProps={{ iconName: "Download" }}
                onClick={exportHealthData}
              >
                Export Health Data
              </PrimaryButton>
            </p>
          )}
        {appState !== "unsetup" &&
          localUserIsEligiblePresenter &&
          isOrganizer && (
            <>
              <p>
                <TooltipHost content="This button initializes the game, resetting all progress and settings.">
                  <PrimaryButton
                    iconProps={{ iconName: "Refresh" }}
                    style={{ backgroundColor: "#f00" }}
                    onClick={() => {
                      resetGame();
                    }}
                  >
                    Reload Game
                  </PrimaryButton>
                </TooltipHost>
              </p>
            </>
          )}
      </div>
    );
  }
};
