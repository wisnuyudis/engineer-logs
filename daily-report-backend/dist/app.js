"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pino_http_1 = __importDefault(require("pino-http"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const inviteRoutes_1 = __importDefault(require("./routes/inviteRoutes"));
const activationRoutes_1 = __importDefault(require("./routes/activationRoutes"));
const activityRoutes_1 = __importDefault(require("./routes/activityRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const telegramRoutes_1 = __importDefault(require("./routes/telegramRoutes"));
const taxonomyRoutes_1 = __importDefault(require("./routes/taxonomyRoutes"));
const jiraRoutes_1 = __importDefault(require("./routes/jiraRoutes"));
const kpiRoutes_1 = __importDefault(require("./routes/kpiRoutes"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
app.use((0, pino_http_1.default)());
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});
// Serve static files for attachments
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.use('/api/auth', authRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/invite', inviteRoutes_1.default);
app.use('/api/activate', activationRoutes_1.default);
app.use('/api/activities', activityRoutes_1.default);
app.use('/api/dashboard', dashboardRoutes_1.default);
app.use('/api/telegram', telegramRoutes_1.default);
app.use('/api/taxonomy', taxonomyRoutes_1.default);
app.use('/api/jira', jiraRoutes_1.default);
app.use('/api/kpi', kpiRoutes_1.default);
exports.default = app;
