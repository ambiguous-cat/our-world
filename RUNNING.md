# 运行与配置

所有命令从本仓库根目录执行。实际配置项和就地填写说明以 [`.env.example`](.env.example) 为准；此文补充操作方法和行为限制。

## 环境文件

本地首次使用复制为 `.env.local`，填写两种登录答案和随机会话密钥。生产使用 `.env.production`，配置真实 HTTPS 地址及发布目录外的持久化绝对路径，设置 `AUTH_COOKIE_SECURE=true`。生产不要保留 `.env.local`，它可能覆盖生产文件。

应用与数据库命令使用同一套 Next.js 环境文件加载器。已有进程环境变量优先，其后依次为 `.env.<环境>.local`、`.env.local`、`.env.<环境>`、`.env`；`test` 环境不读取 `.env.local`。

- `npm run dev` 使用 development。
- `npm run build`、`npm run start` 使用 production。
- `db:migrate`、`db:verify`、`db:generate`、`db:studio` 未显式指定 `NODE_ENV` 时按 production 加载；显式设置为 development 时读取开发专属配置，test 时读取测试配置。
- 默认推荐本地只用 `.env.local`，生产只用 `.env.production`，减少模式差异。

例如需要读取 `.env.development`：

```powershell
$env:NODE_ENV = 'development'
npm run db:migrate
# 完成后恢复此前的 NODE_ENV；若此前未设置：
Remove-Item Env:NODE_ENV
```

```bash
NODE_ENV=development npm run db:migrate
```

相对路径基于命令的当前工作目录。迁移前核对目标 `DATABASE_PATH`；已有 Shell、服务管理器或 PM2 注入的同名变量会覆盖文件。不要在有真实数据的目录试跑不确定的配置。

环境值含空格或 `#` 时加引号；字面 `$` 写成 `\$`。值会去除首尾空白。修改环境文件后重启应用；更换会话密钥会使现有会话失效。仅修改登录答案不会撤销已签发的会话。

## 登录与首次配置

`PLAYER_ANSWER` 同时决定玩家登录答案和已登录页面的玩家称呼，`ADMIN_ANSWER` 仅用于管理员登录。两者必须不同；当前相同答案会优先识别为玩家，无法通过该答案进入管理员界面。

登录失败限流为进程内全站共享：默认十分钟内累计五次失败，锁定十五分钟，锁定响应为 `429`。当前仅支持单进程运行。没有自助注册、修改凭据页面或多用户权限管理。

初始数据没有实际奖品和题版。管理员应先完成券种、概率、奖池、库存及玩家余额配置；答题模块导入 `.txt` / `.md` 后先检查草稿和奖励再发布。玩家每份题版仅首次全部单选题正确时获奖，文字题不参与对错判定。

导入格式示例：

```markdown
# 一起认识小世界
> 示例题版

## [single] 哪个选项表示正确？
- [ ] 选项 A
- [x] 选项 B

### 解析
这里可以填写 **解析**。

## [text] 今天有什么想分享的？
### 参考答案
文字题不计入全对判定，参考答案可省略。
```

## 可选邮件

默认 `EMAIL_NOTIFICATIONS_ENABLED=false`，不会新建邮件任务，站内消息仍正常工作。开启后按模板填齐 Resend 密钥、发件邮箱、发件名称、玩家收件邮箱和完整站点 URL。正式 URL 例如 `https://example.com/our-world`，必须包含 `/our-world`，不要填写服务器监听端口。

当前仅通知玩家，不提供管理员邮件通知。`EMAIL_REPLY_TO` 可选；发件邮箱应满足 Resend 验证要求。密钥和邮箱仅在服务端配置，不添加 `NEXT_PUBLIC_` 前缀。

邮件失败不会回滚发券、发布或答题奖励。任务保存在数据库 outbox，后续相关操作和访问首页可触发到期重试；这不是独立后台定时投递服务。关闭开关会暂停投递，已有任务不会因此被删除，重新启用后可能继续发送。

## 验证命令

| 命令 | 用途与限制 |
| --- | --- |
| `npm run test:env` | 隔离验证配置优先级、中文路径、迁移与校验 CLI，不读取实际环境文件 |
| `npm run lint` | ESLint 静态检查 |
| `npm run build` | 生产构建，含 TypeScript 检查；构建可能初始化数据库连接，应使用测试路径 |
| `npm run db:migrate` | 对选定数据库核验历史并应用迁移；会写数据，不是纯检查 |
| `npm run db:verify` | 只读验证初始数据库结构和基线数据；不适合作为任意已有业务库的通用健康检查 |
| `npm run smoke:member-migration` | 临时数据库验证历史数据保留、幂等和失败回滚，无需启动服务 |
| `npm run smoke:login-rate-limit` | 临时数据库与 3018 端口，验证身份、权限、隔离及限流 |
| `npm run smoke:quiz` | 临时数据库与 3020 端口，验证导入、提交、奖励与通知幂等 |
| `npm run smoke:admin-records` | 临时数据库与 3016 端口，验证管理记录 |
| `npm run smoke:balance-notices` | 临时数据库与 3017 端口，验证获券通知 |
| `npm run smoke:multi-tickets` | 临时数据库与 3018 端口，验证多券种 |
| `npm run smoke:player-collection` | 临时数据库与 3015 端口，验证收藏与兑换 |
| `npm run smoke:prize-image-upload` | 临时数据库、上传目录与 3020 端口，验证图片上传及读取权限 |

服务 smoke 需要先 build，必须串行运行，退出时清理自己的临时目录。邮件相关测试只验证 outbox，不配置可发送的密钥。测试结束不代表人工验收完成；页面布局、移动端交互与正式 HTTPS 环境需另行检查。

## 常见问题

- 打开 `/` 是 404：使用 `/our-world`。Base Path 当前固定在构建配置中，修改邮件 URL 不会改变它。
- HTTP 登录后留不住会话：本地应设置 `AUTH_COOKIE_SECURE=false`；正式 HTTPS 必须为 true。
- 运行时找不到表：先确认数据库命令和应用使用相同的目录、配置模式及 `DATABASE_PATH`，再执行迁移。
- `NODE_MODULE_VERSION` 不匹配：安装依赖与运行应用的 Node ABI 不一致，切换到一致版本后重新执行 `npm ci`。
- 安装原生依赖失败：区分网络下载、安装策略和编译工具缺失，不要直接认定代码不兼容。离线环境可能缺少平台专用包或预编译二进制。
- 没有奖品可抽：检查概率配置、当前券种奖池、奖品启用状态和库存；预览券面不扣券，正式开始才提交抽奖。
