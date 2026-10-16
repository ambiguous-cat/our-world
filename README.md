# Our World · 我们的小世界

一个供两人自行部署使用的生活小站：用刮刮乐送出小惊喜，把礼物收进收藏，再一起玩有奖励的趣味答题。

项目代码和项目自有文档采用 [MIT 许可证](LICENSE)。第三方依赖及网络图片不纳入本项目的 MIT 授权，主题素材的来源与授权状态另见 [素材说明](ASSETS.md)。

## 可以做什么

- 玩家与管理员分别通过自己设置的答案登录，共用功能主页和首页寄语。
- 管理员配置券种、概率、奖池与库存，发放奖券；玩家刮奖、收藏礼物并申请兑换。
- 管理员创建或导入题版，玩家提交后查看答案和解析；首次全对可获得奖券。
- 首页统一展示获券和新题版消息；可选使用 Resend 向玩家发送邮件通知。

生活记录目前仅有 `/our-world/memories/preview` 前端样式预览，包含虚构记录，试写内容刷新后消失；没有正式的记录保存、照片上传或数据库功能。主页仍将它标为准备中。预览页面不是隐私记录存储入口。

这是固定两位成员、`player` / `admin` 两种角色的应用，没有账号注册、多租户或传统账号密码体系。`PLAYER_ANSWER` 同时是玩家登录答案和登录后的展示称呼；管理员也能看到该称呼。适合双方共同信任的私用场景。

## 本地启动

需要 Node.js 和 npm。当前 Next.js 依赖要求 Node.js 至少为 `20.9.0`；这不是对所有更高版本的兼容承诺。`better-sqlite3` 是原生依赖，切换 Node 主版本后应重新安装依赖。目录中有锁文件，请使用 `npm ci`。

以下命令均在包含 `package.json` 的仓库根目录执行，不需要进入第二层 `our-world/`。

```bash
npm ci
```

把 `.env.example` 复制为 `.env.local`：

```powershell
# Windows PowerShell
Copy-Item -LiteralPath .env.example -Destination .env.local
```

```bash
# Linux / macOS
cp .env.example .env.local
```

打开 `.env.local`，填写 `PLAYER_ANSWER`、`ADMIN_ANSWER` 和 `AUTH_SESSION_SECRET`。两种答案必须不同；模板中提供了随机密钥生成命令。其他本地默认值可保持不变，邮件无需启用。

```bash
npm run db:migrate
npm run dev
```

访问 [http://localhost:3000/our-world](http://localhost:3000/our-world)。根路径 `/` 不提供本项目页面。登录后进入 `/our-world/home`。

空数据库会初始化两种券和零余额，不包含你自己的礼物或题版。先以管理员登录，在刮刮乐后台配置奖品、库存、券种概率和奖池，再发券给玩家。若奖品概率大于零，必须有可抽取的有效库存。

## 配置、部署与数据

- [运行与配置说明](RUNNING.md)：环境文件、角色、邮件、常见问题和检查命令。
- [部署、升级与恢复](DEPLOYMENT.md)：单进程运行、HTTPS、持久化、备份和恢复。
- [Nginx 示例](deploy/nginx.conf.example) 与 [PM2 示例](deploy/ecosystem.config.cjs)：需要自行替换域名、目录与证书路径。
- [素材说明](ASSETS.md)：网络图片与第三方依赖的授权边界。

Next.js + TypeScript 提供全栈应用，SQLite + Drizzle 保存数据。所有模块使用同一个进程、一个数据库；数据库和上传图片都应独立持久化。真实环境文件、数据库、上传、备份、日志、依赖目录和构建产物不属于源码。

## 验证

```bash
npm run test:env
npm run lint
npm run build
npm run smoke:member-migration
npm run smoke:login-rate-limit
npm run smoke:quiz
```

需要服务的 smoke 使用已经完成的生产构建，会启动本机临时服务；请逐个执行，避免端口冲突。测试使用隔离数据库和测试身份，不投递真实邮件。更多脚本与限制见 [运行说明](RUNNING.md#验证命令)。
