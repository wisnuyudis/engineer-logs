"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = __importDefault(require("./app"));
const telegramBot_1 = require("./bot/telegramBot");
const PORT = process.env.PORT || 4000;
const startServer = () => {
    app_1.default.listen(PORT, () => {
        console.log(`🚀 Server ready at http://localhost:${PORT}`);
        (0, telegramBot_1.startBot)();
    });
};
startServer();
