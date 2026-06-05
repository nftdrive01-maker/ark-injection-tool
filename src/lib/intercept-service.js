"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInterceptResponse = buildInterceptResponse;
var crypto_1 = require("crypto");
var domains_1 = require("@/lib/domains");
var beyond_core_client_1 = require("@/lib/beyond-core-client");
var domain_shared_log_1 = require("@/lib/domain-shared-log");
var mcp_runtime_1 = require("@/lib/mcp-runtime");
var sessions_1 = require("@/lib/sessions");
function containsChineseText(text) {
    var _a;
    if (!text || text.length < 4)
        return false;
    if (/[为时说语广场国车门线达这从仅们体龙]/.test(text)) {
        return true;
    }
    var fnWords = (_a = text.match(/(?:的|了|在|是|和|及|并|通过|可以|进行|访问)/g)) !== null && _a !== void 0 ? _a : [];
    if (fnWords.length >= 2 && !/[\u3040-\u30ff]/.test(text)) {
        return true;
    }
    return false;
}
function filterChineseContent(text) {
    var parts = text.split(/(?<=[。！？!?])|\n/);
    var kept = [];
    for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
        var part = parts_1[_i];
        var trimmed = part.trim();
        if (!trimmed)
            continue;
        if (containsChineseText(trimmed))
            continue;
        kept.push(trimmed);
    }
    return kept.join('\n').trim();
}
function requiresStrictFetchFormat(userText) {
    return /(fetch\s*mcp|参照した\s*url|取得した内容の要約|推測\s*禁止|推測\s*は\s*禁止|必ず.*fetch|出力には以下を必ず含めてください)/i.test(userText);
}
var CHRONICLE_TRIGGER_MARKER = '[[USE_CHRONICLE]]';
function sanitizeChronicleMessage(userText) {
    var normalized = (userText || '').split(CHRONICLE_TRIGGER_MARKER).join('').trim();
    return normalized || userText;
}
function hasExplicitChronicleTrigger(userText) {
    var text = (userText || '').trim();
    if (!text) {
        return false;
    }
    if (text.includes(CHRONICLE_TRIGGER_MARKER)) {
        return true;
    }
    return /(?:クロニクル|chronicle).*(?:使って|参照|確認|実行|検証)|(?:オンチェーン|ブロックチェーン).*(?:確認|検証)|(?:検証|確認).*(?:クロニクル|chronicle|オンチェーン)/i.test(text);
}
function createStrictFetchInstruction(mcpSucceeded) {
    if (!mcpSucceeded) {
        return "\n====================\n\u3010\u56DE\u7B54\u5236\u7D04\uFF08\u5FC5\u9808\uFF09\u3011\n\u3053\u306E\u8CEA\u554F\u306FFetch MCP\u7D50\u679C\u304C\u5FC5\u9808\u3067\u3059\u3002MCP\u7D50\u679C\u304C\u5F97\u3089\u308C\u306A\u304B\u3063\u305F\u305F\u3081\u3001\u56DE\u7B54\u306F\u6B21\u306E\u56FA\u5B9A\u6587\u306E\u307F\u3092\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\u300C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u300D\n\u8FFD\u52A0\u8AAC\u660E\u30FB\u63A8\u6E2C\u30FB\u88DC\u8DB3\u306F\u7981\u6B62\u3067\u3059\u3002\n";
    }
    return "\n====================\n\u3010\u56DE\u7B54\u5236\u7D04\uFF08\u5FC5\u9808\uFF09\u3011\n\u4EE5\u4E0B\u3092\u5FC5\u305A\u5B88\u3063\u3066\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n1. \u81EA\u5206\u306E\u77E5\u8B58\u3084\u63A8\u6E2C\u3067\u88DC\u5B8C\u3057\u306A\u3044\n2. \u76F4\u4E0A\u306EMCP\u5B9F\u884C\u7D50\u679C\u3060\u3051\u3092\u6839\u62E0\u306B\u3059\u308B\n3. \u51FA\u529B\u306B\u5FC5\u305A\u6B21\u306E2\u9805\u76EE\u3092\u542B\u3081\u308B\n   - \u53C2\u7167\u3057\u305FURL\n   - \u53D6\u5F97\u3057\u305F\u5185\u5BB9\u306E\u8981\u7D04\n4. URL\u304C\u5224\u5225\u3067\u304D\u306A\u3044\u5834\u5408\u306F\u300C\u53C2\u7167\u3057\u305FURL: \u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u300D\u3068\u660E\u8A18\u3059\u308B\n";
}
function normalizeUrlCandidate(raw) {
    return raw
        .trim()
        .replace(/[)>\]」』、。！？!?.,;:]+$/g, '');
}
function extractSourceUrls(text) {
    if (!text)
        return [];
    var urls = [];
    var seen = new Set();
    var urlLineRegex = /(?:^|\n)URL:\s*(https?:\/\/[^\s]+)/g;
    var lineMatch;
    while ((lineMatch = urlLineRegex.exec(text)) !== null) {
        var normalized = normalizeUrlCandidate(lineMatch[1] || '');
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        urls.push(normalized);
    }
    var genericRegex = /(https?:\/\/[^\s<>")\]]+)/g;
    var genericMatch;
    while ((genericMatch = genericRegex.exec(text)) !== null) {
        var normalized = normalizeUrlCandidate(genericMatch[1] || '');
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        urls.push(normalized);
    }
    return urls;
}
function isGoogleAuthRequiredOutput(text) {
    if (!text)
        return false;
    return /(?:ACTION REQUIRED:\s*Google authentication needed|Google\s*アカウントが必要|Open the following URL in your browser|accounts\.google\.com\/(?:oauth2\/auth|o\/oauth2\/auth|o\/oauth2\/v2\/auth))/i.test(text);
}
function extractMcpCountSummary(output) {
    var _a;
    if (!output)
        return null;
    try {
        var parsed = JSON.parse(output);
        var firstRow = Array.isArray((_a = parsed === null || parsed === void 0 ? void 0 : parsed.data) === null || _a === void 0 ? void 0 : _a.rows) ? parsed.data.rows[0] : null;
        if (!firstRow || typeof firstRow !== 'object') {
            return null;
        }
        for (var _i = 0, _b = Object.entries(firstRow); _i < _b.length; _i++) {
            var _c = _b[_i], key = _c[0], value = _c[1];
            if (!/(?:^|_)(?:count|total_count|total|件数|総数)(?:$|_)/i.test(key)) {
                continue;
            }
            var normalizedValue = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
            if (!/^\d+(?:\.\d+)?$/.test(normalizedValue)) {
                continue;
            }
            return "\u7DCF\u4EF6\u6570\u306F ".concat(normalizedValue, " \u4EF6\u3067\u3059\u3002");
        }
        return null;
    }
    catch (_d) {
        var regexMatch = output.match(/"(?:total_count|count|total)"\s*:\s*"?(\d+(?:\.\d+)?)"?/i);
        if (!(regexMatch === null || regexMatch === void 0 ? void 0 : regexMatch[1])) {
            return null;
        }
        return "\u7DCF\u4EF6\u6570\u306F ".concat(regexMatch[1], " \u4EF6\u3067\u3059\u3002");
    }
}
function extractNumericCountValue(summary) {
    var _a;
    if (!summary) {
        return null;
    }
    var match = summary.match(/(\d+(?:\.\d+)?)\s*件/);
    return (_a = match === null || match === void 0 ? void 0 : match[1]) !== null && _a !== void 0 ? _a : null;
}
function normalizeDbPreviewValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    try {
        return JSON.stringify(value);
    }
    catch (_a) {
        return String(value);
    }
}
function normalizeDbQueryText(userText) {
    var normalized = userText.replace(/\s+/g, ' ').trim();
    return normalized || undefined;
}
function inferDbSortLabel(userText) {
    var normalized = userText.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return undefined;
    }
    if (/(家賃|賃料).*(安い順|低い順)|安い順.*(家賃|賃料)/.test(normalized)) {
        return '家賃が安い順';
    }
    if (/(家賃|賃料).*(高い順)|高い順.*(家賃|賃料)/.test(normalized)) {
        return '家賃が高い順';
    }
    if (/(新しい順|築浅順|築年数.*新しい|新着順)/.test(normalized)) {
        return '築年数が新しい順';
    }
    if (/(古い順|築年数.*古い)/.test(normalized)) {
        return '築年数が古い順';
    }
    if (/(広い順|面積.*広い|専有面積.*広い)/.test(normalized)) {
        return '面積が広い順';
    }
    if (/(狭い順|面積.*狭い|専有面積.*狭い)/.test(normalized)) {
        return '面積が狭い順';
    }
    if (/(駅近|徒歩.*短い|近い順|駅から近い)/.test(normalized)) {
        return '駅から近い順';
    }
    return undefined;
}
function extractDbResultPayload(output, userText, serverId, serverName, toolName) {
    var _a, _b;
    if (!output) {
        return undefined;
    }
    if (serverId === 'estat' && toolName === 'search_statistics') {
        try {
            var parsed = JSON.parse(output);
            var rows = Array.isArray(parsed) ? parsed : [];
            if (rows.length === 0) {
                return undefined;
            }
            var previewRows = rows.slice(0, 10).map(function (row) { return ({
                statsId: typeof row.id === 'string' ? row.id : null,
                統計表名: typeof row.name === 'string' ? row.name : null,
                作成機関: typeof row.organization === 'string' ? row.organization : null,
                調査時点: typeof row.survey_date === 'string' ? row.survey_date : null,
            }); });
            return {
                title: 'e-Stat検索結果',
                sourceName: serverName || serverId,
                toolName: toolName,
                summary: "e-Stat \u306E\u7D71\u8A08\u8868\u5019\u88DC\u3092 ".concat(rows.length, " \u4EF6\u53D6\u5F97\u3057\u307E\u3057\u305F\u3002\u4E0A\u4F4D ").concat(previewRows.length, " \u4EF6\u3092\u8868\u793A\u3057\u3066\u3044\u307E\u3059\u3002"),
                queryText: normalizeDbQueryText(userText),
                totalCount: rows.length,
                previewColumns: ['statsId', '統計表名', '作成機関', '調査時点'],
                previewRows: previewRows,
            };
        }
        catch (_c) {
            return undefined;
        }
    }
    if (serverId !== 'dbhub') {
        return undefined;
    }
    try {
        var parsed = JSON.parse(output);
        var rows = Array.isArray((_a = parsed === null || parsed === void 0 ? void 0 : parsed.data) === null || _a === void 0 ? void 0 : _a.rows) ? parsed.data.rows : [];
        if (rows.length === 0) {
            return undefined;
        }
        var firstRow = (_b = rows[0]) !== null && _b !== void 0 ? _b : {};
        var totalCountEntry_1 = Object.entries(firstRow).find(function (_a) {
            var key = _a[0], value = _a[1];
            if (!/(?:^|_)(?:count|total_count|total|件数|総数)(?:$|_)/i.test(key)) {
                return false;
            }
            var normalizedValue = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
            return /^\d+(?:\.\d+)?$/.test(normalizedValue);
        });
        var totalCount = totalCountEntry_1
            ? Number(typeof totalCountEntry_1[1] === 'number' ? totalCountEntry_1[1] : String(totalCountEntry_1[1]).trim())
            : undefined;
        var previewRowsSource = totalCountEntry_1 ? rows.slice(1) : rows;
        if (previewRowsSource.length === 0) {
            return undefined;
        }
        var previewRows = previewRowsSource.map(function (row) {
            var normalized = {};
            for (var _i = 0, _a = Object.entries(row); _i < _a.length; _i++) {
                var _b = _a[_i], key = _b[0], value = _b[1];
                normalized[key] = normalizeDbPreviewValue(value);
            }
            return normalized;
        });
        var previewColumns = previewRows.length > 0
            ? Object.keys(previewRows[0])
            : Object.keys(firstRow).filter(function (key) { return key !== (totalCountEntry_1 === null || totalCountEntry_1 === void 0 ? void 0 : totalCountEntry_1[0]); });
        var summaryParts = [];
        if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
            summaryParts.push("\u691C\u7D22\u7D50\u679C\u306F\u5408\u8A08 ".concat(totalCount, " \u4EF6\u3067\u3059\u3002"));
        }
        if (previewRows.length > 0) {
            summaryParts.push("\u7D50\u679C\u30D3\u30E5\u30FC\u306B\u306F ".concat(previewRows.length, " \u4EF6\u3092\u8868\u793A\u3057\u3066\u3044\u307E\u3059\u3002"));
        }
        if (previewColumns.length > 0) {
            summaryParts.push("\u4E3B\u306A\u5217\u306F ".concat(previewColumns.slice(0, 6).join('、'), " \u3067\u3059\u3002"));
        }
        return {
            title: 'DB検索結果',
            sourceName: serverName || serverId,
            toolName: toolName,
            summary: summaryParts.join(' '),
            queryText: normalizeDbQueryText(userText),
            sortLabel: inferDbSortLabel(userText),
            totalCount: typeof totalCount === 'number' && Number.isFinite(totalCount) ? totalCount : undefined,
            previewColumns: previewColumns,
            previewRows: previewRows,
        };
    }
    catch (_d) {
        return undefined;
    }
}
function formatDbResultForPrompt(dbResult) {
    if (!dbResult) {
        return null;
    }
    var lines = [];
    if (typeof dbResult.totalCount === 'number' && Number.isFinite(dbResult.totalCount)) {
        lines.push("\u3010\u7DCF\u4EF6\u6570\u3011\n".concat(dbResult.totalCount, " \u4EF6"));
    }
    if (dbResult.sourceName || dbResult.toolName) {
        lines.push("\u3010\u30C7\u30FC\u30BF\u30BD\u30FC\u30B9\u3011\n".concat(dbResult.sourceName || 'dbhub').concat(dbResult.toolName ? " / ".concat(dbResult.toolName) : ''));
    }
    return lines.length > 0 ? lines.join('\n\n') : null;
}
function formatMcpPreviewValue(value) {
    if (value == null) {
        return '-';
    }
    var text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) {
        return '-';
    }
    return text.length > 80 ? "".concat(text.slice(0, 77), "...") : text;
}
function summarizePreviewRow(row, preferredColumns) {
    var columns = preferredColumns.filter(function (column) { return column in row; });
    var fallbackColumns = Object.keys(row).filter(function (column) { return !columns.includes(column); });
    var selected = __spreadArray(__spreadArray([], columns, true), fallbackColumns, true).slice(0, 4);
    return selected
        .map(function (column) { return "".concat(column, ": ").concat(formatMcpPreviewValue(row[column])); })
        .join(' / ');
}
function parseWebSearchOutput(output) {
    if (!output) {
        return null;
    }
    try {
        var parsed = JSON.parse(output);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        var results = Array.isArray(parsed.results)
            ? parsed.results
                .filter(function (item) { return Boolean(item) && typeof item === 'object'; })
                .map(function (item, index) { return ({
                rank: typeof item.rank === 'number' && Number.isFinite(item.rank) ? item.rank : index + 1,
                title: typeof item.title === 'string' ? item.title : '',
                url: typeof item.url === 'string' ? item.url : '',
                domain: typeof item.domain === 'string' ? item.domain : '',
                snippet: typeof item.snippet === 'string' ? item.snippet : '',
                page_summary: typeof item.page_summary === 'string' ? item.page_summary : '',
                page_excerpt: typeof item.page_excerpt === 'string' ? item.page_excerpt : '',
                page_summary_status: typeof item.page_summary_status === 'string' ? item.page_summary_status : '',
            }); })
            : [];
        var notes = Array.isArray(parsed.notes)
            ? parsed.notes.filter(function (note) { return typeof note === 'string' && Boolean(note.trim()); })
            : [];
        return {
            query: typeof parsed.query === 'string' ? parsed.query : '',
            engine: typeof parsed.engine === 'string' ? parsed.engine : '',
            search_url: typeof parsed.search_url === 'string' ? parsed.search_url : '',
            fetched_at: typeof parsed.fetched_at === 'string' ? parsed.fetched_at : '',
            result_count: typeof parsed.result_count === 'number' && Number.isFinite(parsed.result_count) ? parsed.result_count : results.length,
            selected_count: typeof parsed.selected_count === 'number' && Number.isFinite(parsed.selected_count) ? parsed.selected_count : results.length,
            results: results,
            notes: notes,
        };
    }
    catch (_a) {
        return null;
    }
}
function formatWebSearchPayloadForPrompt(payload) {
    var _a;
    var lines = ['[WEB????]'];
    if (payload.query) {
        lines.push("???: ".concat(payload.query));
    }
    if (payload.fetched_at) {
        lines.push("????: ".concat(payload.fetched_at));
    }
    if (typeof payload.result_count === 'number') {
        lines.push("??????: ".concat(payload.result_count));
    }
    var results = Array.isArray(payload.results) ? payload.results.slice(0, 3) : [];
    if (results.length > 0) {
        lines.push('????:');
        for (var _i = 0, results_1 = results; _i < results_1.length; _i++) {
            var result = results_1[_i];
            var title = formatMcpPreviewValue(result.title);
            var url = formatMcpPreviewValue(result.url);
            var domain = formatMcpPreviewValue(result.domain);
            var summary = formatMcpPreviewValue(result.page_summary || result.snippet);
            lines.push("- ".concat((_a = result.rank) !== null && _a !== void 0 ? _a : '').concat(result.rank ? '. ' : '').concat(title).trim());
            if (domain !== '-') {
                lines.push("  ???: ".concat(domain));
            }
            if (url !== '-') {
                lines.push("  URL: ".concat(url));
            }
            if (summary !== '-') {
                lines.push("  ??: ".concat(summary));
            }
        }
    }
    if (Array.isArray(payload.notes) && payload.notes.length > 0) {
        lines.push('??:');
        for (var _b = 0, _c = payload.notes.slice(0, 3); _b < _c.length; _b++) {
            var note = _c[_b];
            lines.push("- ".concat(note));
        }
    }
    return lines.join('\n');
}
function buildMcpReactionPrompt(params) {
    var userText = params.userText, serverId = params.serverId, toolName = params.toolName, dbResult = params.dbResult;
    if (!dbResult || !Array.isArray(dbResult.previewRows) || dbResult.previewRows.length === 0) {
        return null;
    }
    var totalCount = typeof dbResult.totalCount === 'number' && Number.isFinite(dbResult.totalCount)
        ? dbResult.totalCount
        : dbResult.previewRows.length;
    var isSearchLike = serverId === 'estat'
        || toolName === 'search_objects'
        || (toolName === 'execute_sql' && dbResult.previewRows.length > 1);
    var preferredColumns = serverId === 'estat'
        ? ['統計表名', '作成機関', '調査時点', 'statsId']
        : ['title', 'name', 'city', 'ward', 'rent', 'id'];
    var topSummaries = dbResult.previewRows
        .slice(0, 5)
        .map(function (row, index) { return "- \u5019\u88DC".concat(index + 1, ": ").concat(summarizePreviewRow(row, preferredColumns)); })
        .join('\n');
    var reactionGuide = isSearchLike
        ? 'ユーザーに、あなた自身が検索して上位候補を見つけてきたように自然に報告してください。候補一覧を全文読み上げたり、そのまま列挙したりしてはいけません。どんな候補が見つかったかの傾向を短く伝え、必要なら次の絞り込み方を1つか2つ提案してください。回答は2〜4文程度に収めてください。'
        : 'ユーザーに、あなた自身が結果を確認してきたように自然に報告してください。表や一覧の全文を読み上げず、要点・傾向・次の見方を短く案内してください。回答は2〜4文程度に収めてください。';
    return "\n====================\n\u3010MCP\u30EA\u30A2\u30AF\u30B7\u30E7\u30F3\u7528\u8981\u7D04\u3011\n\u30E6\u30FC\u30B6\u30FC\u306E\u8CEA\u554F:\n".concat(userText, "\n\n\u8FD4\u3063\u3066\u304D\u305F\u7D50\u679C\u4EF6\u6570:\n").concat(totalCount, "\u4EF6\n\n\u4E0A\u4F4D\u5019\u88DC\u306E\u8981\u7D04\uFF08\u6700\u59275\u4EF6\uFF09:\n").concat(topSummaries, "\n\n\u3010\u30EA\u30A2\u30AF\u30B7\u30E7\u30F3\u6307\u793A\u3011\n").concat(reactionGuide, "\n- UI\u306B\u306F\u7D50\u679C\u30D1\u30CD\u30EB\u304C\u8868\u793A\u3055\u308C\u3066\u3044\u308B\u524D\u63D0\u3067\u8A71\u3057\u3066\u304F\u3060\u3055\u3044\n- statsId\u3084\u30EC\u30B3\u30FC\u30C9ID\u306E\u7F85\u5217\u306F\u907F\u3051\u3066\u304F\u3060\u3055\u3044\n- \u53D6\u5F97\u3067\u304D\u3066\u3044\u306A\u3044\u4E8B\u5B9F\u3092\u63A8\u6E2C\u3067\u88DC\u308F\u306A\u3044\u3067\u304F\u3060\u3055\u3044\n");
}
function buildInterceptResponse(params) {
    return __awaiter(this, void 0, void 0, function () {
        var body, domain, userId, _a, persistSharedLog, requestId, sessionId, userText, attachedPackIds, firstChronicleId, hasChronicleAttached, chronicleTriggered, injectedSystemPrompt, citationCandidates, hasCrawlKnowledge, _i, _b, knowledgeId, knowledge, _c, _d, extractedUrl, resolvedMcpServerIds, mcpResult, chronicleResult, chronicle, chronicleMessage, result, dbResultPayload, isWebSearchMcp, injectedUserContext, forceVerbatimAuthOutput, compactDbContext, reactionPrompt, webPayload, webUrls, _e, webUrls_1, extractedUrl, _f, _g, extractedUrl, mcpOutput, hasChinese, _h, _j, extractedUrl, mcpCountSummary, exactCountValue, chroniclePayload, strictFetchRequired, shouldRequireCitations, sourceList, sourceBlock, response, logError_1;
        var _k, _l, _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    body = params.body, domain = params.domain, userId = params.userId, _a = params.persistSharedLog, persistSharedLog = _a === void 0 ? true : _a;
                    requestId = (params.requestId || body.requestId || '').trim() || (0, crypto_1.randomUUID)();
                    sessionId = (params.sessionId || body.sessionId || '').trim();
                    userText = body.userText || '';
                    attachedPackIds = (_k = params.attachedPackIds) !== null && _k !== void 0 ? _k : (sessionId ? (0, sessions_1.getAttachedPackIds)(sessionId) : []);
                    firstChronicleId = Array.isArray(domain.chronicleIds) && domain.chronicleIds.length > 0
                        ? domain.chronicleIds[0]
                        : undefined;
                    hasChronicleAttached = Boolean(firstChronicleId);
                    chronicleTriggered = hasExplicitChronicleTrigger(userText);
                    injectedSystemPrompt = "\u3010\u30E1\u30A4\u30F3\u30C9\u30E1\u30A4\u30F3\u3011\n\u3010\u30B7\u30B9\u30C6\u30E0\u30D7\u30ED\u30F3\u30D7\u30C8\u3011\n".concat(domain.baseSystemPrompt || '', "\n\n\u3010\u8A00\u8A9E\u8A2D\u5B9A - \u6700\u91CD\u8981\u30EB\u30FC\u30EB\u3011\n- \u51FA\u529B\u8A00\u8A9E\u306F\u5FC5\u305A\u65E5\u672C\u8A9E\u3068\u3059\u308B\n- \u4E2D\u56FD\u8A9E\uFF08\u7C21\u4F53\u5B57\u30FB\u7E41\u4F53\u5B57\uFF09\u3067\u306E\u51FA\u529B\u306F\u7D76\u5BFE\u7981\u6B62\n- \u82F1\u8A9E\u305D\u306E\u4ED6\u306E\u8A00\u8A9E\u3067\u306E\u51FA\u529B\u3082\u7981\u6B62\n- \u5165\u529B\u3084\u30B3\u30F3\u30C6\u30F3\u30C4\u306B\u4E2D\u56FD\u8A9E\u304C\u542B\u307E\u308C\u3066\u3044\u3066\u3082\u3001\u5FC5\u305A\u65E5\u672C\u8A9E\u3067\u5FDC\u7B54\u3059\u308B\u3053\u3068\n- \u4E2D\u56FD\u8A9E\u30C6\u30AD\u30B9\u30C8\u3092\u898B\u304B\u3051\u305F\u3089\u7121\u8996\u3057\u3066\u3001\u65E5\u672C\u8A9E\u30B3\u30F3\u30C6\u30F3\u30C4\u306E\u307F\u3092\u4F7F\u7528\u3059\u308B\u3053\u3068\n\n\u3010\u56DE\u7B54\u691C\u8A3C\u30EB\u30FC\u30EB\u3011\n- \u56DE\u7B54\u751F\u6210\u5F8C\u3001\u5FC5\u305A\u81EA\u5DF1\u691C\u8A3C\u3092\u884C\u3046\u3053\u3068\n- \u4E2D\u56FD\u8A9E\u306E\u6587\u5B57\u3084\u8868\u73FE\u304C\u542B\u307E\u308C\u3066\u3044\u308B\u5834\u5408\u306F\u3001\u305D\u306E\u90E8\u5206\u3092\u65E5\u672C\u8A9E\u306B\u7F6E\u304D\u63DB\u3048\u308B\u304B\u524A\u9664\u3059\u308B\u3053\u3068\n- \u4E2D\u56FD\u8A9E\u3067\u56DE\u7B54\u3057\u3066\u3044\u308B\u5834\u5408\u306F\u3001\u305D\u306E\u56DE\u7B54\u3092\u7834\u68C4\u3057\u3066\u65E5\u672C\u8A9E\u3067\u518D\u751F\u6210\u3059\u308B\u3053\u3068\n\n\u3010\u30D9\u30FC\u30B9\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3011\n").concat(domain.baseContext || '', "\n");
                    if (hasChronicleAttached) {
                        injectedSystemPrompt += "\n====================\n\u3010CHRONICLE\u547C\u3073\u51FA\u3057\u30EB\u30FC\u30EB\u3011\n- \u3053\u306E\u30C9\u30E1\u30A4\u30F3\u306B\u306FCHRONICLE\u304C\u63A5\u7D9A\u3055\u308C\u3066\u3044\u307E\u3059\n- CHRONICLE\u306F\u660E\u793A\u30C8\u30EA\u30AC\u30FC\u304C\u3042\u308B\u3068\u304D\u3060\u3051\u547C\u3073\u51FA\u3055\u308C\u307E\u3059\n- \u660E\u793A\u30C8\u30EA\u30AC\u30FC\u4F8B: \u300C\u30AF\u30ED\u30CB\u30AF\u30EB\u3067\u78BA\u8A8D\u3057\u3066\u300D\u300C\u30AA\u30F3\u30C1\u30A7\u30FC\u30F3\u3067\u691C\u8A3C\u3057\u3066\u300D\n- UI\u306E\u300CChronicle\u300D\u30DC\u30BF\u30F3\u62BC\u4E0B\u3067\u3082\u660E\u793A\u30C8\u30EA\u30AC\u30FC\u3068\u3057\u3066\u6271\u308F\u308C\u307E\u3059\n";
                    }
                    citationCandidates = new Set();
                    hasCrawlKnowledge = false;
                    if (Array.isArray(domain.knowledgeIds) && domain.knowledgeIds.length > 0) {
                        for (_i = 0, _b = domain.knowledgeIds; _i < _b.length; _i++) {
                            knowledgeId = _b[_i];
                            knowledge = (0, domains_1.getKnowledgeById)(knowledgeId);
                            if (knowledge && knowledge.enabled) {
                                if (/^#\s*サイト解析結果/m.test(knowledge.context) || /(?:^|\n)URL:\s*https?:\/\//.test(knowledge.context)) {
                                    hasCrawlKnowledge = true;
                                }
                                for (_c = 0, _d = extractSourceUrls(knowledge.context); _c < _d.length; _c++) {
                                    extractedUrl = _d[_c];
                                    citationCandidates.add(extractedUrl);
                                }
                                injectedSystemPrompt += "\n====================\n\u3010\u8FFD\u52A0\u30CA\u30EC\u30C3\u30B8\u3011\n\u3010\u30CA\u30EC\u30C3\u30B8\u540D\u3011\n".concat(knowledge.name, "\n\n\u3010\u30CA\u30EC\u30C3\u30B8\u30D7\u30ED\u30F3\u30D7\u30C8\u3011\n").concat(knowledge.systemPrompt || '', "\n\n\u3010\u30CA\u30EC\u30C3\u30B8\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3011\n").concat(knowledge.context || '', "\n");
                            }
                        }
                    }
                    resolvedMcpServerIds = __spreadArray([], (domain.mcpServerIds || []), true);
                    return [4 /*yield*/, (0, mcp_runtime_1.executeMCPForDomain)({
                            mcpServerIds: resolvedMcpServerIds,
                            userText: userText,
                            requestId: requestId,
                            sessionId: sessionId,
                            userId: userId,
                            attachedPackIds: attachedPackIds,
                        })];
                case 1:
                    mcpResult = _o.sent();
                    chronicleResult = null;
                    if (!(firstChronicleId && chronicleTriggered)) return [3 /*break*/, 3];
                    chronicle = (0, domains_1.getChronicleById)(firstChronicleId);
                    if (!(chronicle && chronicle.enabled)) return [3 /*break*/, 3];
                    chronicleMessage = sanitizeChronicleMessage(userText);
                    return [4 /*yield*/, (0, beyond_core_client_1.callChronicleChat)({
                            host: chronicle.host,
                            tcpPort: chronicle.tcpPort,
                            message: chronicleMessage,
                            memoryIds: domain.memoryIds,
                        })];
                case 2:
                    result = _o.sent();
                    chronicleResult = {
                        success: result.ok,
                        chronicleName: chronicle.name,
                        output: result.output,
                        error: result.error,
                    };
                    _o.label = 3;
                case 3:
                    dbResultPayload = (mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.success) && mcpResult.output
                        ? extractDbResultPayload(mcpResult.output, userText, mcpResult.serverId, mcpResult.serverName, mcpResult.toolName)
                        : undefined;
                    isWebSearchMcp = (mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.success)
                        && mcpResult.serverId === 'mcp'
                        && mcpResult.toolName === 'search_web';
                    injectedUserContext = '';
                    if ((mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.success) && mcpResult.output) {
                        forceVerbatimAuthOutput = isGoogleAuthRequiredOutput(mcpResult.output);
                        compactDbContext = formatDbResultForPrompt(dbResultPayload);
                        reactionPrompt = buildMcpReactionPrompt({
                            userText: userText,
                            serverId: mcpResult.serverId,
                            toolName: mcpResult.toolName,
                            dbResult: dbResultPayload,
                        });
                        if (reactionPrompt) {
                            injectedSystemPrompt += reactionPrompt;
                        }
                        if (isWebSearchMcp) {
                            webPayload = parseWebSearchOutput(mcpResult.output);
                            webUrls = (_m = (_l = webPayload === null || webPayload === void 0 ? void 0 : webPayload.results) === null || _l === void 0 ? void 0 : _l.map(function (result) { return result.url; }).filter(function (url) { return Boolean(url && url.trim()); })) !== null && _m !== void 0 ? _m : extractSourceUrls(mcpResult.output);
                            for (_e = 0, webUrls_1 = webUrls; _e < webUrls_1.length; _e++) {
                                extractedUrl = webUrls_1[_e];
                                citationCandidates.add(extractedUrl);
                            }
                            injectedUserContext = webPayload
                                ? formatWebSearchPayloadForPrompt(webPayload)
                                : "MCP?????WEB???\n????: ".concat(mcpResult.serverName || mcpResult.serverId || 'unknown', "\n???: ").concat(mcpResult.toolName || 'unknown', "\n??:\n").concat(mcpResult.output);
                            injectedSystemPrompt += "\n====================\nWEB????????\n- ?????????????\n- ????JSON? title / url / page_summary ???????????\n- ??3???????????????????????????\n- ????????????????????????????\n- ???????????????\n- ?????????????????????????????\n- ?????????????????????????\n";
                        }
                        else if (forceVerbatimAuthOutput) {
                            for (_f = 0, _g = extractSourceUrls(mcpResult.output); _f < _g.length; _f++) {
                                extractedUrl = _g[_f];
                                citationCandidates.add(extractedUrl);
                            }
                            injectedSystemPrompt += "\n====================\n??oogle????????????????????\n?????MCP???????????????????????????????????????????????????????\n- URL??1?????????????????????????????????????\n- URL?????????, &, =, %, /?????????\n- URL??????????????????????????????????\n\n??CP????????????????\n".concat(mcpResult.output, "\n");
                        }
                        else {
                            mcpOutput = compactDbContext || mcpResult.output;
                            hasChinese = containsChineseText(mcpOutput);
                            for (_h = 0, _j = extractSourceUrls(mcpOutput); _h < _j.length; _h++) {
                                extractedUrl = _j[_h];
                                citationCandidates.add(extractedUrl);
                            }
                            if (hasChinese) {
                                mcpOutput = filterChineseContent(mcpOutput);
                                if (mcpOutput.trim().length < 80) {
                                    injectedSystemPrompt += "\n====================\n????????????\n??????????????????????????????????????????????????????????????????????\n??????????????????????????????????????????????????????????????\n\n??????????????????\n- ????????????????????????????????????????????????????\n- MCP???????????????????????????????????????????????????????????????\n";
                                }
                                else {
                                    injectedSystemPrompt += "\n====================\n??CP???????????????????????????????????\n??????????\n".concat(mcpResult.serverName || mcpResult.serverId || 'unknown', "\n\n?????????\n").concat(mcpResult.toolName || 'unknown', "\n\n???????\n").concat(mcpOutput, "\n\n????????????\n?????????????????????????????????\n- ??????????????????????????????????????????????\n- ?????????????????????????????????????????\n");
                                }
                            }
                            else {
                                mcpCountSummary = extractMcpCountSummary(mcpResult.output);
                                exactCountValue = extractNumericCountValue(mcpCountSummary);
                                injectedSystemPrompt += "\n====================\n??CP?????????\n??????????\n".concat(mcpResult.serverName || mcpResult.serverId || 'unknown', "\n\n?????????\n").concat(mcpResult.toolName || 'unknown', "\n\n???????\n").concat(compactDbContext || mcpResult.output, "\n\n").concat(mcpCountSummary ? "???????????????\n".concat(mcpCountSummary, "\n\n") : '', "????????????\n?????????????????????????????????\n- ????????????????????????????????????????????????????????????????????????????\n- ").concat(exactCountValue ? "????????????????????????????????? ".concat(exactCountValue, " ??????????0 ???????????????????????????????") : '?????????????????B?????????????????????????????????', "\n- ???????????????en ????????????????????\n- ???????????????????????????????\n- ?????????????????????????????????????????????????\n");
                            }
                        }
                    }
                    chroniclePayload = (chronicleResult === null || chronicleResult === void 0 ? void 0 : chronicleResult.success) && chronicleResult.output
                        ? {
                            title: 'CHRONICLE',
                            content: chronicleResult.output,
                            sourceName: chronicleResult.chronicleName,
                        }
                        : undefined;
                    injectedSystemPrompt += "\n====================\n\u3010\u6839\u62E0\u5236\u7D04\u3011\n- \u56DE\u7B54\u306FMCP\u5B9F\u884C\u7D50\u679C\u306B\u542B\u307E\u308C\u308B\u60C5\u5831\u3060\u3051\u3092\u6839\u62E0\u306B\u3059\u308B\u3053\u3068\n- \u6839\u62E0\u304C\u4E0D\u8DB3\u3059\u308B\u9805\u76EE\u306F\u65AD\u5B9A\u305B\u305A\u3001\u65E5\u672C\u8A9E\u3067\u78BA\u8A8D\u5148\u3092\u6848\u5185\u3059\u308B\u3053\u3068\n- \u4E2D\u56FD\u8A9E\u6587\u5B57\u304C\u6DF7\u5165\u3057\u305F\u5834\u5408\u306F\u51FA\u529B\u3092\u7834\u68C4\u3057\u3001\u65E5\u672C\u8A9E\u306E\u307F\u3067\u518D\u751F\u6210\u3059\u308B\u3053\u3068\n";
                    strictFetchRequired = requiresStrictFetchFormat(userText);
                    shouldRequireCitations = hasCrawlKnowledge || (mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.toolName) === 'crawl_site' || citationCandidates.size > 0;
                    if (shouldRequireCitations) {
                        sourceList = Array.from(citationCandidates).slice(0, 12);
                        sourceBlock = sourceList.length > 0
                            ? sourceList.map(function (url) { return "- ".concat(url); }).join('\n')
                            : '- （URL抽出なし）';
                        injectedSystemPrompt += "\n====================\n\u3010\u51FA\u5178URL\u30EB\u30FC\u30EB\uFF08\u5FC5\u9808\uFF09\u3011\n- \u30B5\u30A4\u30C8\u89E3\u6790\u7531\u6765\u306E\u60C5\u5831\u3092\u4F7F\u3063\u3066\u56DE\u7B54\u3057\u305F\u5834\u5408\u3001\u56DE\u7B54\u672B\u5C3E\u306B\u5FC5\u305A\u300C\u51FA\u5178URL\u300D\u3092\u8A18\u8F09\u3059\u308B\n- \u56DE\u7B54\u306B\u5229\u7528\u3057\u305F\u30DA\u30FC\u30B8URL\u306E\u307F\u3092\u5217\u6319\u3059\u308B\uFF08\u63A8\u6E2CURL\u306F\u7981\u6B62\uFF09\n- \u51FA\u5178\u304C\u8907\u6570\u3042\u308B\u5834\u5408\u306F\u8907\u6570\u884C\u3067\u5217\u6319\u3059\u308B\n- URL\u6587\u5B57\u5217\u306F\u5019\u88DC\u3092\u305D\u306E\u307E\u307E\u4F7F\u7528\u3057\u3001\u9014\u4E2D\u306B\u7A7A\u767D\u3092\u5165\u308C\u306A\u3044\uFF08\u4F8B: https://www.example.com\uFF09\n- URL\u4E2D\u306E\u82F1\u5B57\u30FB\u8A18\u53F7\u306F\u305D\u306E\u307E\u307E\u4FDD\u6301\u3059\u308B\uFF08\u7FFB\u8A33\u30FB\u5909\u63DB\u30FB\u5206\u5272\u3092\u3057\u306A\u3044\uFF09\n\n\u3010\u51FA\u5178URL\u5019\u88DC\u3011\n".concat(sourceBlock, "\n\n\u3010\u51FA\u529B\u5F62\u5F0F\uFF08\u672B\u5C3E\u306B\u5FC5\u305A\u8FFD\u52A0\uFF09\u3011\n\u51FA\u5178URL:\n- https://example.com/page-a\n- https://example.com/page-b\n");
                    }
                    if (strictFetchRequired) {
                        injectedSystemPrompt += createStrictFetchInstruction(Boolean((mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.success) && mcpResult.output));
                    }
                    injectedSystemPrompt += "\n====================\n\u3010\u51FA\u529B\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8\u3011\n\u56DE\u7B54\u306F\u8A71\u984C\u30FB\u5185\u5BB9\u304C\u5909\u308F\u308B\u30BF\u30A4\u30DF\u30F3\u30B0\u3067\u5FC5\u305A\u6539\u884C\uFF08\u7A7A\u884C\uFF09\u3092\u5165\u308C\u3001\u8AAD\u307F\u3084\u3059\u3044\u6BB5\u843D\u69CB\u9020\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u30021\u3064\u306E\u6BB5\u843D\u306F3\u301C5\u6587\u7A0B\u5EA6\u3092\u76EE\u5B89\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\n\u3010\u6700\u7D42\u691C\u8A3C - \u4E2D\u56FD\u8A9E\u30D5\u30A3\u30EB\u30BF\u30EA\u30F3\u30B0\uFF08\u7D76\u5BFE\u7981\u6B62\uFF09\u3011\n\u56DE\u7B54\u3092\u9001\u51FA\u3059\u308B\u524D\u306B\u5FC5\u305A\u4EE5\u4E0B\u3092\u30C1\u30A7\u30C3\u30AF\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u3053\u306E\u691C\u8A3C\u306B\u5931\u6557\u3057\u305F\u5834\u5408\u306F\u56DE\u7B54\u3092\u7834\u68C4\u3057\u3066\u518D\u751F\u6210\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A\n\n1. \u4EE5\u4E0B\u306E\u7C21\u4F53\u5B57\u4E2D\u56FD\u8A9E\u6587\u5B57\u304C\u542B\u307E\u308C\u3066\u3044\u306A\u3044\u304B\uFF1A\n   \u7684\u3001\u8BF4\u3001\u662F\u3001\u5728\u3001\u4E00\u3001\u4E2A\u3001\u4E3A\u3001\u4E86\u3001\u65F6\u3001\u88AB\u3001\u79CD\u3001\u4F20\u3001\u7EDF\u3001\u8BDD\u3001\u8BED\u3001\u8BD7\u3001\u7B7E\u3001\u5360\u3001\u535C\u3001\u65B9\u3001\u5F0F\u3001\u901A\u3001\u5E38\u3001\u795E\u3001\u793E\u3001\u5BFA\u3001\u5E99\u3001\u8FDB\u3001\u884C\u3001\u7948\u3001\u613F\u3001\u83B7\u3001\u5F97\u3001\u8457\u3001\u540D\u3001\u8D22\u3001\u5E7F\u3001\u6EA1\u3001\u6C47\u3001\u56FD\u3001\u9645\u3001\u57CE\u3001\u5E02\u3001\u5730\u3001\u533A\u3001\u57DF\u3001\u5BAB\u3001\u5E99\n   \uFF08\u4E0A\u8A18\u306E\u6587\u5B57\u304C1\u500B\u3067\u3082\u542B\u307E\u308C\u3066\u3044\u305F\u3089\u3001\u305D\u306E\u90E8\u5206\u3092\u65E5\u672C\u8A9E\u306B\u7F6E\u304D\u63DB\u3048\u308B\u304B\u524A\u9664\u3057\u3066\u304F\u3060\u3055\u3044\uFF09\n\n2. \u82F1\u8A9E\u304C\u542B\u307E\u308C\u3066\u3044\u306A\u3044\u304B\uFF08\u56FA\u6709\u540D\u8A5E\u3092\u9664\u304F\uFF09\n\n3. \u3059\u3079\u3066\u65E5\u672C\u8A9E\u3067\u8A18\u8FF0\u3055\u308C\u3066\u3044\u308B\u304B\n\n4. \u30B3\u30F3\u30C6\u30F3\u30C4\u304C\u3059\u3079\u3066\u65E5\u672C\u8A9E\u3067\u3001\u8AAD\u307F\u3084\u3059\u3044\u6587\u7AE0\u69CB\u6210\u304B\n\n\u4E0A\u8A18\u306E\u78BA\u8A8D\u304C\u5B8C\u4E86\u3057\u305F\u3089\u3001\u5B89\u5FC3\u3057\u3066\u56DE\u7B54\u3092\u51FA\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n\u4E07\u304C\u4E00\u3001\u691C\u8A3C\u3067\u554F\u984C\u304C\u898B\u3064\u304B\u3063\u305F\u5834\u5408\u306F\u3001\u65E5\u672C\u8A9E\u306E\u307F\u3067\u65B0\u3057\u304F\u56DE\u7B54\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002\n";
                    response = {
                        injectedSystemPrompt: injectedSystemPrompt,
                        injectedUserContext: injectedUserContext,
                        dbResult: dbResultPayload,
                        chronicle: chroniclePayload,
                        metadata: {
                            requestId: requestId,
                            sessionId: sessionId,
                            domainId: domain.id,
                            ttl: domain.ttl,
                            version: domain.version,
                            mcpUsed: Boolean(mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.success),
                            mcpServerId: mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.serverId,
                            mcpToolName: mcpResult === null || mcpResult === void 0 ? void 0 : mcpResult.toolName,
                            mcpError: mcpResult && !mcpResult.success ? mcpResult.error : undefined,
                            mcpErrorCode: mcpResult && !mcpResult.success ? mcpResult.errorCode : undefined,
                            attachedPackIds: attachedPackIds,
                            chronicleUsed: Boolean(chronicleResult === null || chronicleResult === void 0 ? void 0 : chronicleResult.success),
                            chronicleName: chronicleResult === null || chronicleResult === void 0 ? void 0 : chronicleResult.chronicleName,
                            chronicleError: chronicleResult && !chronicleResult.success ? chronicleResult.error : undefined,
                            chronicleAttached: hasChronicleAttached,
                            chronicleTriggered: chronicleTriggered,
                            strictFetchRequired: strictFetchRequired,
                            strictFetchInjected: strictFetchRequired,
                        },
                    };
                    if (!(persistSharedLog && domain.sharedLogEnabled)) return [3 /*break*/, 7];
                    _o.label = 4;
                case 4:
                    _o.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, domain_shared_log_1.writeDomainSharedLog)({
                            domainId: domain.id,
                            requestId: requestId,
                            sessionId: sessionId || null,
                            userId: userId,
                            userText: userText,
                            requestBody: body,
                            responseBody: response,
                            mcpResult: mcpResult,
                            chronicleResult: chronicleResult,
                        })];
                case 5:
                    _o.sent();
                    return [3 /*break*/, 7];
                case 6:
                    logError_1 = _o.sent();
                    console.error('Shared log write error:', logError_1);
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/, response];
            }
        });
    });
}
