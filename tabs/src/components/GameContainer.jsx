/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import background from "../assets/game-bg.png";
import background2 from "../assets/pexels-ann-h-1762851.jpg";
import { FlexColumn } from "./flex";

export const GameContainer = ({ children }) => {
    return (
        <FlexColumn 
            style={{
                padding: "2.8rem",
                backgroundImage: `url(${background2})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                position: "absolute",
                left: "0",
                right: "0",
                top: "0",
                bottom: "0",
                minHeight: "100vh", 
                overflow: "auto",
            }}
        >
            {children}
        </FlexColumn>
    );
};
