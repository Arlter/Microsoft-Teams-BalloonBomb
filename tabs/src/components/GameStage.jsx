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

export const GameStage = (presence) => {
  const [people, setPeople] = useState([]);
  const [canRestart, setCanRestart] = useState(false);
  //unsetup, setup, started, ended
  const [appState, setAppState] = useState("unsetup");
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [userId, setUserId] = useState("");
  const [inputSize, setInputSize] = useState([10, 50]);
  const [open, setOpen] = useState(false);
  const [gameData, setGameData] = useState([]);
  const ALLOWED_ROLES = [UserMeetingRole.organizer, UserMeetingRole.presenter];

  const {
    unityProvider,
    addEventListener,
    removeEventListener,
    sendMessage,
    isLoaded,
  } = useUnityContext({
    // loaderUrl: "http://localhost:8081/Build/build-aug4-msg.loader.js",
    // dataUrl: "http://localhost:8081/Build/build-aug4-msg.data",
    // frameworkUrl: "http://localhost:8081/Build/build-aug4-msg.framework.js",
    // codeUrl: "http://localhost:8081/Build/build-aug4-msg.wasm",
    loaderUrl: "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug4-msg.loader.js",
    dataUrl: "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug4-msg.data",
    frameworkUrl: "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug4-msg.framework.js",
    codeUrl: "https://balloonbomb.blob.core.windows.net/$web/Build/build-aug4-msg.wasm",
  });

  useEffect(() => {
    const initialize = async () => {
      await app.initialize();
      app.notifySuccess();
      const context = await app.getContext();
      const userId = context?.user?.id;
      await FluidService.connect();
      const people = await FluidService.getPersonList();
      const appState = await FluidService.getAppState();
      setAppState(appState.appState);
      setPeople(people.people);
      setUserId(userId);
      setGameData(getSortedItems(people.people));
      initializeIcons();

      FluidService.onNewData((people) => {
        setPeople(people.people);
        setGameData(getSortedItems(people.people));
      });
      FluidService.onNewPumpData((pumpProxy) => {
        sendMessage("pump", "setPumpStart");
      });

      FluidService.onNewBlowData((blowProxy) => {
        sendMessage("pump", "setPumpExplodeSize", blowProxy.blowsize[2]);
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

  const handleClickExplodeSize = async () => {
    if (inputSize && inputSize.length >= 2) {
      const min = inputSize[0];
      const max = inputSize[1];
      const randomInt = Math.floor(Math.random() * (max - min)) + min;
      await FluidService.setBlowSize([...inputSize, randomInt]);
      setAppState("started");
      await FluidService.setAppState("started");
    }
  };
  const isCurrentUserFirst = () => {
    return people.length > 0 && people[0].id === localUser.userId;
  };

  const handleClickPumpUp = async () => {
    if (isLoaded && isCurrentUserFirst()) {
      await FluidService.increaseData(localUser.userId);
      //getSortedItems();
    }
  };

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
    console.log("This is result", res);
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
    <div className="wrapper">
      {people && people.length > 0 && (
        <>
          {appState !== "unsetup" && isLoaded && (
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
              >
                <Space>
                  Game Data
                  <DownOutlined />
                </Space>
              </a>
            </Dropdown>
          )}
          <div className="unity">
            <Unity
              unityProvider={unityProvider}
              style={{ width: "100%", height: 500 }}
            />
          </div>
          {appState === "setup" && isOrganizer && (
            <Card style={{ marginTop: 20 }}>
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
                </Col>
              </Row>
              <Row justify="center">
                <Col>
                  <Button type="primary" onClick={handleClickExplodeSize}>
                    Set Max Blow Pumps
                  </Button>
                </Col>
                <Col>
                  <Tooltip title="A random number will be selected from the given range as the balloon blow size.">
                    <QuestionCircleOutlined
                      style={{ marginLeft: 8, marginTop: 15 }}
                    />
                  </Tooltip>
                </Col>
              </Row>
            </Card>
          )}
          {appState === "started" && (
            <Card style={{ marginTop: 10 }}>
              <Row justify="center">
                <Col>
                  <Button
                    type="primary"
                    onClick={handleClickPumpUp}
                    disabled={!isCurrentUserFirst()}
                  >
                    Pump Up
                  </Button>
                </Col>
              </Row>
            </Card>
          )}
          {canRestart === "true" && appState === "ended" && isOrganizer && (
            <Card style={{ marginTop: 20 }}>
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
  );
};
