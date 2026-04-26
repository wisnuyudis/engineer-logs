"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
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
const auditRoutes_1 = __importDefault(require("./routes/auditRoutes"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const allowedOrigins = new Set([process.env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'].filter(Boolean));
const isLocalDevOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && (allowedOrigins.has(origin) || isLocalDevOrigin(origin))) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});
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
app.use('/api/audit', auditRoutes_1.default);
exports.default = app;
