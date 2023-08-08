import React, { Fragment, useState, useCallback, useEffect } from "react";
//import { useLiveCanvas } from "../utils/useLiveCanvas";
import FluidService from "../services/fluidLiveShare.js";
import { app } from "@microsoft/teams-js";
import "./GameStage.scss";
import { UserMeetingRole } from "@microsoft/live-share";
import * as liveShareHooks from "../live-share-hooks/index.js";
import { initializeIcons } from "@fluentui/font-icons-mdl2";
import { Unity, useUnityContext } from "react-unity-webgl";
import { Slider, Button, Row, Col, Card, Tooltip } from "antd";
import { Dropdown, Space } from "antd";
import { DownOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { GameContainer } from "./GameContainer.jsx";
import { debounce } from "lodash";

export const GameStage = (presence) => {
  const [people, setPeople] = useState([]);
  const [canRestart, setCanRestart] = useState(false);
  //unsetup, setup, started, ended
  const [appState, setAppState] = useState("unsetup");
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [userId, setUserId] = useState("");
  const [inputSize, setInputSize] = useState([10, 50]);
  const [playerRange, setPlayerRange] = useState([1, 10, 0]);
  const [open, setOpen] = useState(false);
  const [gameData, setGameData] = useState([]);
  const [gameSetInfo, setGameSetInfo] = useState(["", ""]);
  const ALLOWED_ROLES = [UserMeetingRole.organizer, UserMeetingRole.presenter];

  const {
    unityProvider,
    addEventListener,
    removeEventListener,
    sendMessage,
    isLoaded,
  } = useUnityContext({
    // loaderUrl: "http://localhost:8081/Build/build-aug8-new.loader.js",
    // dataUrl: "http://localhost:8081/Build/build-aug8-new.data",
    // frameworkUrl: "http://localhost:8081/Build/build-aug8-new.framework.js",
    // codeUrl: "http://localhost:8081/Build/build-aug8-new.wasm",
    loaderUrl:
      "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug8-new.loader.js",
    dataUrl:
      "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug8-new.data",
    frameworkUrl:
      "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug8-new.framework.js",
    codeUrl:
      "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug8-new.wasm",
  });

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
      setAppState(appState.appState);
      setPeople(people.people);
      setUserId(userId);
      setPlayerRange(playerRange.pumpTriggerCount);
      setGameData(getSortedItems(people.people));
      initializeIcons();

      FluidService.onNewData((people) => {
        setPeople(people.people);
        setGameData(getSortedItems(people.people));
      });
      FluidService.onNewPumpData((pumpProxy) => {
        if (pumpProxy.pumpTriggerCount[2] != 0) {
          sendMessage("pump", "setPumpStart");
        }
        setPlayerRange([...pumpProxy.pumpTriggerCount]);
        setGameSetInfo((prevGameSetInfo) => [
          prevGameSetInfo[0],
          `Pump Range Per Turn: ${pumpProxy.pumpTriggerCount[0]} ~ ${pumpProxy.pumpTriggerCount[1]}`,
        ]);
      });
      FluidService.onNewBlowData((blowProxy) => {
        sendMessage("pump", "setPumpExplodeSize", blowProxy.blowsize[2]);
        setGameSetInfo([
          `Balloon Blow Range: ${blowProxy.blowsize[0]} ~ ${blowProxy.blowsize[1]} `,
          gameSetInfo[1], // keep the second element
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
    users,
    localUser, // boolean that is true if local user is in one of the allowed roles
  } = liveShareHooks.usePresence(presence, ALLOWED_ROLES);

  const findUserById = (users, userId) => {
    return users.find((user) => user.userId === userId);
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
    // player range
    await FluidService.setPlayerRange([...playerRange, 0]);
    setAppState("started");
    await FluidService.setAppState("started");
  };

  const isCurrentUserFirst = () => {
    return people.length > 0 && people[0].id === localUser.userId;
  };

  // const handleClickPumpUp = async () => {
  //   if (isLoaded && isCurrentUserFirst()) {
  //     await FluidService.increaseData(localUser.userId);
  //     //getSortedItems();
  //   }
  // };

  const handleClickPumpUp = useCallback(
    debounce(async () => {
      if (isLoaded && isCurrentUserFirst()) {
        await FluidService.increaseData(localUser.userId);
      }
    }, 100),
    [isLoaded, isCurrentUserFirst]
  );

  const handleClickRestart = async () => {
    if (isLoaded) {
      await FluidService.restartGame();
      setAppState("setup");
      await FluidService.setAppState("setup");
      setCanRestart(false);
    }
  };

  const handleRestartGame = useCallback(async (canRestart) => {
    setCanRestart(canRestart);
    if (canRestart === "true") {
      setAppState("ended");
      await FluidService.setAppState("ended");
    }
  }, []);

  const getSortedItems = (people) => {
    const res = [...people]
      .sort((a, b) => b.data - a.data)
      .map((person, index) => ({
        label: `${index + 1}. ${person.name} - ${person.data}`,
        key: index + 1,
      }));
    //console.log("This is result", res);
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
      <div className="wrapper">
        {people && people.length > 0 && (
          <>
            {appState !== "unsetup" && isLoaded && (
              <Card style={{ marginBottom: 0 }}>
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
                          padding: "8px 7px",
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
                  <Col flex="auto" style={{ textAlign: "center" }}>
                    {appState !== "unsetup" && appState !== "setup" && (
                      <span className="game-set-info">
                        {gameSetInfo[0]} | {gameSetInfo[1]}
                      </span>
                    )}
                  </Col>
                  <Col> {/* 一个空的列作为占位符 */}</Col>
                </Row>
              </Card>
            )}
            {appState !== "unsetup" && (
              <div className="unity">
                <Unity
                  unityProvider={unityProvider}
                  style={{ width: "100%", height: "420" }}
                />
              </div>
            )}

            {isLoaded && appState === "setup" && isOrganizer && (
              <Card style={{ marginTop: 0 }}>
                <Row justify="center">
                  <Col span={20}>
                    <Slider
                      min={1}
                      max={60}
                      range
                      defaultValue={[10, 50]}
                      value={inputSize}
                      onChange={(value) => setInputSize(value)}
                    />
                    <Slider
                      min={1}
                      max={60}
                      range
                      defaultValue={[1, 10]}
                      value={[playerRange[0], playerRange[1]]}
                      onChange={(value) => setPlayerRange(value)}
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
                      submit settings
                    </Button>
                  </Col>
                  <Col>
                    <Tooltip title="A random number will be selected from the range as the balloon blow size.">
                      <QuestionCircleOutlined
                        style={{ marginLeft: 8, marginTop: 15 }}
                      />
                    </Tooltip>
                  </Col>
                </Row>
              </Card>
            )}
            {appState === "started" && (
              <Card style={{ marginTop: 0 }}>
                <Row justify="center">
                  <Col>
                    <Button
                      type="primary"
                      onClick={handleClickPumpUp}
                      disabled={
                        !isCurrentUserFirst() ||
                        playerRange[2] >= playerRange[1]
                      }
                    >
                      Pump Up
                    </Button>
                  </Col>
                </Row>
              </Card>
            )}
            {canRestart === "true" && appState === "ended" && isOrganizer && (
              <Card style={{ marginTop: 0 }}>
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
