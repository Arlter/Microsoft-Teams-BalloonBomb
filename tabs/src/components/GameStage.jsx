// React imports
import React, { useState, useCallback, useEffect } from "react";

// Services and Hooks
import FluidService from "../services/fluidLiveShare.js";
import * as liveShareHooks from "../live-share-hooks/index.js";

// Microsoft Teams and Fluent UI
import { app } from "@microsoft/teams-js";
import { UserMeetingRole } from "@microsoft/live-share";
import { initializeIcons } from "@fluentui/font-icons-mdl2";

// Unity
import { Unity, useUnityContext } from "react-unity-webgl";

// Ant Design UI components
import { Slider, Button, Row, Col, Card, Tooltip, Dropdown, Space } from "antd";
import { DownOutlined, QuestionCircleOutlined } from "@ant-design/icons";

// Other components and libraries
import { ClockLoader } from "react-spinners";
import { debounce } from "lodash";
import "./GameStage.scss";
import { LiveNotifications } from "./LiveNotifications.jsx";
import { GameContainer } from "./GameContainer.jsx";

export const GameStage = (presence) => {
  // State variables
  const [people, setPeople] = useState([]);
  const [canRestart, setCanRestart] = useState(false);
  const [appState, setAppState] = useState("unsetup");
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isGamer, setIsGamer] = useState(false);
  const [userId, setUserId] = useState("");
  const [inputSize, setInputSize] = useState([10, 50]);
  const [playerRange, setPlayerRange] = useState([1, 10, 0]);
  const [open, setOpen] = useState(false);
  const [gameData, setGameData] = useState([]);
  const [gameSetInfo, setGameSetInfo] = useState(["", ""]);
  const [notificationEvent, setNotificationEvent] = useState(null);
  const ALLOWED_ROLES = [UserMeetingRole.organizer, UserMeetingRole.presenter];
  const [context, setContext] = useState(null);

  // Unity setup
  const {
    unityProvider,
    addEventListener,
    removeEventListener,
    sendMessage,
    isLoaded,
  } = useUnityContext({
    loaderUrl:
      "https://balloonbombunity.blob.core.windows.net/$web/Build/build-aug8-new.loader.js",
    dataUrl:
      "https://balloonbombunity.blob.core.windows.net/$web/Build/build-aug8-new.data",
    frameworkUrl:
      "https://balloonbombunity.blob.core.windows.net/$web/Build/build-aug8-new.framework.js",
    codeUrl:
      "https://balloonbombunity.blob.core.windows.net/$web/Build/build-aug8-new.wasm",
  });

  // Presence hooks
  const { users } = liveShareHooks.usePresence(presence, ALLOWED_ROLES);

  useEffect(() => {
    const initialize = async () => {
      await app.initialize();
      app.notifySuccess();
      const context = await app.getContext();
      const userId = context?.user?.id;
      await FluidService.connect();
      const people = await FluidService.getPersonList();
      const playerRange = await FluidService.getPlayerRange();
      const appState = await FluidService.getAppState();
      const notificationEvents = FluidService.getLiveEvents();
      setContext(context);
      setNotificationEvent(notificationEvents);
      setAppState(appState.appState);
      setPeople(people.people);
      setUserId(userId);
      setPlayerRange(playerRange.pumpTriggerCount);
      setGameData(getSortedItems(people.people));
      setIsGamer(CurrentUserInPeopleList(people.people, userId));
      initializeIcons();

      FluidService.onNewData((people) => {
        setPeople(people.people);
        setGameData(getSortedItems(people.people));
        setIsGamer(CurrentUserInPeopleList(people.people, userId));
      });

      FluidService.onNewPumpData((pumpProxy) => {
        if (pumpProxy.pumpTriggerCount[2] != 0) {
          sendMessage("pump", "setPumpStart");
        } else {
          setGameSetInfo((prevGameSetInfo) => [
            prevGameSetInfo[0],
            `Pumps Per Turn: ${pumpProxy.pumpTriggerCount[0]} ~ ${pumpProxy.pumpTriggerCount[1]}`,
          ]);
        }
        setPlayerRange([...pumpProxy.pumpTriggerCount]);
      });
      FluidService.onNewBlowData((blowProxy) => {
        sendMessage("pump", "setPumpExplodeSize", blowProxy.blowsize[2]);
        setGameSetInfo([
          `Balloon Blow: ${blowProxy.blowsize[0]} ~ ${blowProxy.blowsize[1]} `,
          gameSetInfo[1],
        ]);
      });

      FluidService.onNewRestartData((restartProxy) => {
        sendMessage("pump", "setRestart");
      });
      FluidService.onNewAppStateData((appStateProxy) => {
        setAppState(appStateProxy.appState);
      });
    };
    initialize();
  }, [sendMessage, setGameData]);

  const {
    notificationToDisplay, // most recent notification that was sent through notificationEvent
    sendNotification, // callback method to send a notification through notificationEvent
  } = liveShareHooks.useNotifications(notificationEvent, context);

  const findUserById = (users, userId) => {
    return users.find((user) => user.userId === userId);
  };

  const CurrentUserInPeopleList = (people, userId) => {
    return people.find((user) => user.id === userId);
  };

  useEffect(() => {
    const localUserInUsers = findUserById(users, userId);
    setIsOrganizer(localUserInUsers?.roles.includes(UserMeetingRole.organizer));
  }, [users, userId]);

  const handleOpenChange = (flag) => {
    setOpen(flag);
  };

  const handleSettingChange = async () => {
    const min = inputSize[0];
    const max = inputSize[1];
    const randomInt = Math.floor(Math.random() * (max - min)) + min;
    await FluidService.setBlowSize([...inputSize, randomInt]);
    await FluidService.setPlayerRange([playerRange[0], playerRange[1], 0]);
    setAppState("started");
    await FluidService.setAppState("started");
    sendNotification("just updated the settings");
  };

  const isCurrentUserFirst = () => {
    return people.length > 0 && people[0].id === userId;
  };

  const handleClickPumpUp = useCallback(
    debounce(async () => {
      if (isLoaded && isCurrentUserFirst()) {
        await FluidService.increaseData(userId);
      }
    }, 300),
    [isLoaded, isCurrentUserFirst]
  );

  const handleClickRestart = async () => {
    if (isLoaded) {
      await FluidService.restartGame();
      setAppState("setup");
      await FluidService.setAppState("setup");
      setCanRestart(false);
      sendNotification("just restarted the game");
    }
  };

  const handleKeyDown = (event) => {
    if (
      event.keyCode === 38 &&
      (isCurrentUserFirst() || playerRange[2] < playerRange[1])
    ) {
      handleClickPumpUp();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, people, isCurrentUserFirst, playerRange]);

  const handleRestartGame = useCallback(
    async (canRestart) => {
      setCanRestart(canRestart);
      if (canRestart === "true") {
        if (isCurrentUserFirst()) {
          sendNotification("just blew the balloon 💣");
        }
        setAppState("ended");
        await FluidService.setAppState("ended");
      }
    },
    [people]
  );

  const getSortedItems = (people) => {
    const res = [...people]
      .sort((a, b) => b.data - a.data)
      .map((person, index) => ({
        label: `${index + 1}. ${person.name} - ${person.data}`,
        key: index + 1,
      }));
    return res;
  };

  useEffect(() => {
    addEventListener("isOver", handleRestartGame);
    return () => {
      removeEventListener("isOver", handleRestartGame);
    };
  }, [addEventListener, removeEventListener, handleRestartGame]);

  const handleMenuClick = (e) => {
    if (e.key === "3") {
      setOpen(false);
    }
  };
  return (
    <GameContainer>
      <div
        className="wrapper"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
        }}
      >
        {people && people.length > 0 && (
          <>
            <LiveNotifications notificationToDisplay={notificationToDisplay} />
            {appState !== "unsetup" && isLoaded && (
              <Card style={{ marginTop: 10, height: 63, width: "90%" }}>
                <Row align="middle" justify="space-between">
                  <Col>
                    <Dropdown
                      onOpenChange={handleOpenChange}
                      open={open}
                      menu={{
                        items: [...gameData],
                        onClick: handleMenuClick,
                      }}
                    >
                      <a
                        // className="ant-dropdown-link"
                        onClick={(e) => e.preventDefault()}
                        style={{
                          padding: "18px 17px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "bold",
                          color: "#333",
                        }}
                      >
                        <Space>
                          <DownOutlined />
                          Game Data
                        </Space>
                      </a>
                    </Dropdown>
                  </Col>
                  <Col
                    flex="auto"
                    style={{ textAlign: "center", marginLeft: -60 }}
                  >
                    {appState !== "unsetup" && appState !== "setup" && (
                      <span
                        className="game-set-info"
                        style={{
                          fontSize: "18px",
                          fontWeight: "bold",
                          color: "#4A90E2",
                          animation: "fadingHighlight 2s infinite",
                        }}
                      >
                        {gameSetInfo[0]} 😊{" "}
                        {people.length > 1 && `${gameSetInfo[1]}`}
                      </span>
                    )}
                  </Col>
                  <Col style={{ display: "flex", alignItems: "center" }}>
                    {appState !== "unsetup" && appState !== "setup" && (
                      <>
                        <ClockLoader
                          size={30}
                          color="#36d7b7"
                          cssOverride={{ marginRight: 8 }}
                        />
                        <Tooltip title="The current gamer">
                          <span style={{ fontWeight: "bold", marginRight: 10 }}>
                            {people[0].name}
                          </span>
                        </Tooltip>
                      </>
                    )}
                  </Col>
                </Row>
              </Card>
            )}
            {appState !== "unsetup" && (
              <div className="unity" style={{ width: "90%" }}>
                <Unity
                  unityProvider={unityProvider}
                  style={{ width: "100%", height: "360" }}
                />
              </div>
            )}

            {isLoaded && appState === "setup" && isOrganizer && (
              <Card style={{ marginTop: 0, width: "90%" }}>
                <Row justify="center">
                  <Col span={20}>
                    <Slider
                      min={1}
                      max={60}
                      marks={{ 1: "Blow Range" }}
                      range
                      defaultValue={[10, 50]}
                      value={inputSize}
                      onChange={(value) => setInputSize(value)}
                    />
                    <Slider
                      min={1}
                      max={60}
                      marks={{ 1: "Turn Range" }}
                      range
                      defaultValue={[1, 10]}
                      value={[playerRange[0], playerRange[1]]}
                      onChange={(value) => setPlayerRange([...value, 0])}
                    />
                  </Col>
                </Row>
                <Row justify="center">
                  <Col>
                    <Button
                      type="primary"
                      onClick={handleSettingChange}
                      disabled={!isLoaded}
                    >
                      Submit Settings
                    </Button>
                  </Col>
                  <Col>
                    <Tooltip title="A random number will be selected from the blow range as the balloon blow size; Each player gets to pump within the range of turn range.">
                      <QuestionCircleOutlined
                        style={{ marginLeft: 8, marginTop: 15 }}
                      />
                    </Tooltip>
                  </Col>
                </Row>
              </Card>
            )}
            {appState === "started" && isGamer && isLoaded && (
              <Card style={{ marginTop: 0, height: 70, width: "90%" }}>
                <Row justify="center">
                  <Col>
                    <Button
                      style={{ marginTop: -5 }}
                      type="primary"
                      onClick={handleClickPumpUp}
                      disabled={
                        people.length !== 1 &&
                        (!isCurrentUserFirst() ||
                          playerRange[2] >= playerRange[1])
                      }
                    >
                      Pump Up
                    </Button>
                  </Col>
                </Row>
              </Card>
            )}
            {canRestart === "true" && appState === "ended" && isOrganizer && (
              <Card style={{ marginTop: 0, width: "90%" }}>
                <Row justify="center">
                  <Col>
                    <Button type="primary" onClick={handleClickRestart}>
                      Restart
                    </Button>
                  </Col>
                </Row>
              </Card>
            )}
          </>
        )}
      </div>
    </GameContainer>
  );
};
