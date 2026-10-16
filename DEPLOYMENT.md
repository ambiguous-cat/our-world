# 部署、升级与恢复

以下是 Linux + Nginx + PM2 的通用部署方法，路径和域名均为示例。请自行准备运行用户、目录权限、DNS 与 HTTPS 证书。当前准备阶段不代表已经在你的服务器部署或验证完成。

## 目录与单进程

建议分开保存：

| 内容 | 示例位置 |
| --- | --- |
| 应用源码及构建 | `/srv/our-world` |
| 服务端配置 | `/srv/our-world/.env.production`，仅运行用户可读 |
| SQLite 数据库 | `/var/lib/our-world/app.db` |
| 上传图片 | `/var/lib/our-world/uploads/prizes` |
| 备份 | `/var/backups/our-world`，限制访问并保留异机副本 |

运行用户必须能读配置、写数据库及上传目录。数据库所在目录也需要可写权限，以便创建 WAL/SHM。不要把数据存入 `.next/` 或会被发布替换的目录。内置 `public/` 资源属于源码，运行时上传图片不属于它。

保持一个 Next.js 进程、一个 SQLite 文件。PM2 使用 fork / instances=1；当前内存登录限流不支持集群或多个实例。

构建配置将页面数据采集限制为一个 worker，避免路由模块在多个构建进程中同时初始化 SQLite WAL。这不改变运行时的业务并发或数据规则；升级 Next.js 时应重新验证该构建选项。

## 首次部署

在目标机器安装与原生依赖兼容的 Node.js、npm、PM2 和 Nginx，不从其他操作系统复制 `node_modules`。将完整公开源码放入应用目录后：

```bash
cd /srv/our-world
cp .env.example .env.production
chmod 600 .env.production
```

编辑配置，至少填写三个必填项，并设置：

```dotenv
DATABASE_PATH=/var/lib/our-world/app.db
PRIZE_UPLOAD_DIR=/var/lib/our-world/uploads/prizes
AUTH_COOKIE_SECURE=true
OUR_WORLD_PUBLIC_URL=https://example.com/our-world
EMAIL_NOTIFICATIONS_ENABLED=false
```

确保应用目录没有会覆盖生产值的 `.env.local`，同时核对 PM2 或 Shell 中已有同名变量。随后执行：

```bash
npm ci
NODE_ENV=production npm run db:migrate
npm run build
```

任一步失败都停止后续步骤。不要使用 `drizzle-kit migrate` 替代项目迁移器；必须携带完整 `drizzle/` SQL 和 `meta/`，不要手工更改已应用迁移或删除迁移记录。

编辑 [PM2 模板](deploy/ecosystem.config.cjs) 中的 cwd 后启动：

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 status
pm2 logs our-world --lines 50
```

模板仅监听 `127.0.0.1:3005`。配置 Nginx 与自己的 HTTPS 证书后，检查 `nginx -t`，成功再重载。公网仅开放网站所需端口，应用端口不直接对外提供服务。PM2 的开机恢复按自己的运行用户配置，并在更换 Node 安装路径后重新核对。

`npm run start` 也是生产启动命令，默认 3005 端口；它没有模板中的回环绑定参数，正式部署推荐使用模板或显式执行 `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3005`。

## HTTPS 与访问路径

[Nginx 模板](deploy/nginx.conf.example) 使用 `example.com` 和示例证书位置，必须替换。它只代理 `/our-world` 及子路径，不接管站点根路径，不剥离 Base Path。上传限制为 6 MB，为应用的 5 MB 图片上限预留请求封装空间。

正式 HTTPS 必须设置 `AUTH_COOKIE_SECURE=true`。本地直接 HTTP 测试时需用 false；不要把真实生产配置改为 false 后长期运行。

部署后至少验证：HTTPS 入口、玩家与管理员登录、主页角色差异、已有余额和收藏、刮奖与兑换、答题奖励、图片登录后读取和重启后仍可读取。启用邮件时用受控收件人验证按钮 URL 和去重；不要将本地 outbox 测试当作真实送达验证。

## 备份

备份必须覆盖数据库、上传目录和私密配置。对这个两人小站，最容易核对的是短暂停机备份；不要在进程写入时只复制 SQLite 主文件。

下面命令假设没有其他进程写同一个数据库，且操作用户有权限：

```bash
pm2 stop our-world
backup_directory="/var/backups/our-world/$(date +%Y%m%d-%H%M%S)"
umask 077
mkdir -p "$backup_directory"
cp -a /var/lib/our-world "$backup_directory/data"
cp /srv/our-world/.env.production "$backup_directory/.env.production"
```

确认两次复制均成功，再启动 `pm2 start our-world`。备份失败时也应先明确现状，决定何时恢复服务，不要继续清理源文件。归档包含隐私内容，应限制访问并保留异机副本；不要放入网站静态目录、Git 或源码发布包。

SQLite 停机后的目录复制保留可能存在的 WAL/SHM。若需要不停机备份，另行采用 SQLite 在线备份 API，不能用运行中的普通文件复制代替。

定期从备份副本执行 SQLite `PRAGMA integrity_check` 与 `PRAGMA foreign_key_check`，检查图片清单，并做实际隔离恢复。`db:verify` 含初始券种等基线假设，不适合任意已有业务数据。

## 升级

1. 阅读目标版本说明，确认配置和数据库兼容要求，保存当前应用版本或提交标识。
2. 停止服务并完成数据库、上传及配置备份，确认备份可用。
3. 将目标版本源码部署到应用目录，保留 `.env.production`；不要使用未核对范围的目录清空或镜像覆盖。运行数据始终位于应用目录之外。
4. 在目标 Node 环境执行 `npm ci`、`NODE_ENV=production npm run db:migrate` 和 `npm run build`。迁移或构建失败时不要启动新进程。
5. `pm2 restart our-world --update-env`，检查状态、日志、HTTPS 与本次受影响的业务。

迁移器核验已执行迁移的哈希，事务内应用待执行迁移，并在提交前检查外键和完整性。没有待执行项时不会重复执行，但这不能替代备份。

## 恢复与回滚

先在隔离位置核验备份，使用与备份数据库结构兼容的代码和匹配依赖。恢复时停止服务，先把当前出问题的数据目录和配置另存，再将已检查的数据库、上传和配置成套恢复；核对权限后启动并验证。

不要只恢复数据库而遗漏图片，也不要让旧数据库混用失败版本留下的 WAL/SHM。恢复前将当前整套数据目录另存，确保目标目录是空的或经过明确核对。涉及结构变化时，单独回退源码未必能回退数据库，应使用匹配代码的备份；不能通过删迁移记录或清库实现升级。

更换会话密钥会使现有登录失效。任何包含密钥、邮件地址、玩家内容或上传图片的故障材料都不应直接公开提交。
