# Draw

在线白板 / 画图协作平台：无限画布（基于 Excalidraw）、多页面、实时协同、评论、版本管理、链接分享与嵌入、代码展示节点、图表、Mermaid、Markdown、图标，以及个人中心、API Key 开放接口和后台管理。

## 快速开始

```bash
npm install
cp .env.example .env        # 按需修改
npm run dev                 # 同时启动 API(3000) 与前端(5173)
```

打开 http://localhost:5173 ，**第一个注册的账号自动成为管理员**（可访问 `/dashboard` 后台）。
未配置 SMTP 时不要求邮箱验证；登录 / 找回密码的验证码会打印在服务端日志里。

## 配置

所有部署相关的值都通过环境变量配置（`npm run dev` / `npm start` 会自动读取 `.env`），完整说明见 [`.env.example`](.env.example)。生产环境必填两项，缺了服务会拒绝启动并提示：

| 变量 | 说明 |
| --- | --- |
| `PUBLIC_URL` | 用户在浏览器里访问的地址，如 `https://draw.example.com`。登录 Cookie、来源校验都以它为准；换域名只改这里 |
| `AUTH_SECRET` | 会话签名密钥，≥ 32 位随机字符串（`openssl rand -base64 36`） |
| `TRUSTED_ORIGINS` | 额外入口（如同时用 IP 直连），逗号分隔，支持 `https://*.example.com` |
| `SMTP_*` | 可选；配置后注册需要邮箱验证（可用 `REQUIRE_EMAIL_VERIFICATION` 覆盖） |
| `COOKIE_SECURE` | 可选；默认跟随 `PUBLIC_URL` 是否为 https。https 域名下用 http IP 访问将无法登录 |

启动时日志第一行会打印生效的配置（不含密钥）。

## 部署

### Docker Compose（推荐）

```bash
git clone https://github.com/haowu8888/draw.git && cd draw
cp .env.example .env        # 至少改 PUBLIC_URL、AUTH_SECRET；APP_PORT 为宿主机端口
docker compose up -d --build
```

数据（SQLite 与上传文件）在 volume `draw_data`。前面有 Nginx / OpenResty 反代时，需转发 WebSocket（`/api/collab`）。

### Flow 流水线

[`deploy/flow.yaml`](deploy/flow.yaml)：构建镜像（含类型检查，依赖层走 Docker 缓存）→ 部署到主机组 → 健康检查。
换服务器时只改其中的 `deploy.hosts` / `deploy.target`；域名、端口、密钥、SMTP 都放在 Flow 部署环境的变量和机密里（`DRAW_PUBLIC_URL`、`DRAW_AUTH_SECRET` 等，见文件头注释）。

### 直接运行

```bash
npm ci && npm run build
npm start                   # 读取 .env；由 Node 服务同时提供 API、WebSocket 和静态页面
```

## 技术栈

- 前端：React 19 + React Router 7 + Tailwind CSS 4 + Base UI + TanStack Query + tRPC，画布为 `@excalidraw/excalidraw` 并替换了全部默认 UI
- 后端：Node + Hono + tRPC + better-auth（邮箱密码、邮箱验证码、管理员插件）+ SQLite（better-sqlite3）+ ws

## 目录结构

```
server/
  index.ts         HTTP 入口：/api/auth、/api/trpc、/api/v1（开放接口）、文件/封面、静态资源、WebSocket 升级
  auth.ts          better-auth 配置（首个用户为管理员、验证码邮件、删除账号时清理数据）
  db.ts            SQLite 连接与应用表结构（启动时自动建表）
  boards.ts        画布核心：权限、元素按版本合并、页面缓存与落盘、自动版本、文件、封面
  collab.ts        实时协同 WebSocket（/api/collab）：元素同步、光标与在线成员、事件广播
  openapi.ts       API Key 鉴权的 REST 接口（/api/v1）
  routers/         tRPC 路由：board / boardVersion / folder / comment / apiKey / setting / user / price / codeStack
src/
  pages/           落地页、登录注册找回、定价、个人中心（仪表盘/画布/API Key/账户设置）、后台（仪表盘/用户/订单/任务/系统设置）
  board/           画布编辑器：editor.tsx（同步与多页）、left-toolbar / topbar / selection-bar（自定义 UI）、
                   nodes.tsx（自定义节点）、sandbox.ts（代码展示沙箱）、chart.tsx、markdown.tsx、comments.tsx、versions.tsx
  components/      UI 组件（Base UI 封装）与通用组件
data/              运行时数据（SQLite 数据库、上传文件、封面），已在 .gitignore 中
```

## 主要功能

- **画布**：矩形/椭圆/菱形/箭头/直线/画笔/文本/橡皮擦/画框，20+ 扩展形状，设备外框，Iconify 图标搜索，图片 / 视频，网页嵌入（卡片或可交互网页）
- **自定义节点**：代码展示（HTML / React / Vue 在 `sandbox="allow-scripts"` 的 iframe 中运行，禁止联网）、图表（柱状/折线/面积/散点/饼/环形/雷达/象限，可编辑数据）、Markdown（GFM、提示框、公式、Mermaid）、代码块（Shiki 高亮）
- **Mermaid**：流程图、时序图、类图、状态图、甘特图等转换为可编辑形状，可再次编辑代码
- **协作**：WebSocket 实时同步、他人光标与在线头像、断线重连补发、评论（钉在画布/元素上，回复、解决）
- **页面与版本**：多页面；命名版本 + 每 10 分钟自动版本，预览 / 恢复（恢复前自动备份）/ 重命名 / 删除
- **分享**：仅自己 / 任何获得链接的人（可查看 / 可编辑），重置链接，`/embed/:token` 只读嵌入
- **个人中心**：仪表盘统计、文件夹（嵌套、拖拽排序、拖拽画布到文件夹）、回收站、搜索、复制、移动；账户资料、修改密码、会话管理、订阅、删除账户
- **后台**：画布用量（月度指标、每日趋势、活跃排名）、用户管理（创建/编辑/角色/封禁/重置密码/会话/删除）、订单管理、任务队列、系统设置（站点公告、技术方案、资源库 npm 搜索与转存、字体管理）
- **定价 / 订单**：下单与支付状态轮询；当前使用「模拟支付」渠道，接入微信 / 支付宝时替换 `server/routers/misc.ts` 中的 `createOrder` / `mockPay`

## 开放接口（/api/v1）

在「个人中心 → API Key」创建密钥，请求头带 `Authorization: Bearer dk_...`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/me` | 当前用户 |
| GET / POST | `/api/v1/boards` | 画布列表 / 新建 `{ title }` |
| GET | `/api/v1/boards/:id` | 页面与元素摘要、可用枚举 |
| GET | `/api/v1/boards/:id/scene?pageId=` | 完整元素 |
| POST | `/api/v1/boards/:id/elements` | 批量添加 `{ pageId?, specs: [{ id?, type, x, y, width, height, text, color, fill, from, to, label }] }` |
| PATCH | `/api/v1/boards/:id/elements` | 修改 `{ updates: [{ id, x, y, text, color, fill, ... }] }` |
| DELETE | `/api/v1/boards/:id/elements` | 删除 `{ ids }` 或清空 `{ all: true }` |

通过接口的修改会实时推送给正在打开该画布的协作者。
