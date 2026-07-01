# R2 Admin Go

R2 Admin Go 是一个面向 **Cloudflare R2** 的文件管理面板，用来补齐 R2 官方控制台在日常文件管理、分享、预览、团队协作和权限控制上的体验短板。

项目适合个人图床、静态资源管理、小团队文件协作，也可以作为一个可部署在 Cloudflare Pages 上的 R2 管理后台。

## 当前定位

- **前端与接口**：Next.js App Router + Edge Route Handlers
- **部署方式**：Cloudflare Pages + `next-on-pages`
- **账号体系**：Supabase Auth
- **业务数据**：Supabase Postgres / REST
- **对象存储**：Cloudflare R2 S3 API
- **权限模型**：团队 + RBAC + 成员级权限覆盖
- **桶配置**：用户自行绑定 R2 存储桶，支持多桶、多 Cloudflare 账号

## 功能总览

### 账号与合规入口

- 邮箱验证码注册、登录、退出登录
- 忘记密码与邮箱恢复流程
- 会话保存、会话恢复、临时会话模式
- 修改个人资料、修改密码
- 注销账号和相关业务数据清理
- 登录页内置服务条款、隐私政策、免责声明与第三方预览说明

### 存储桶管理

- 每个账号/团队可绑定多个 R2 存储桶
- 新增、编辑、删除存储桶配置
- 设置默认桶
- 支持公开访问域名、自定义域名和传输模式配置
- 支持混用多个 Cloudflare 账号下的桶
- 存储桶连接校验与中文错误提示
- R2 Access Key / Secret Key 服务端加密保存

### 文件管理

- 文件夹浏览、面包屑导航、列表/网格视图
- 文件类型图标、文件详情面板、路径与元数据展示
- 新建文件夹
- 文件/文件夹重命名、移动、复制
- 单选、多选和批量移动/复制/删除
- 全局搜索
- 文件夹占用量统计
- 排序、分页、移动端抽屉/底部面板适配

### 上传与下载

- 单文件上传
- 文件夹上传入口
- 大文件分片上传
- 上传队列、暂停、继续、取消
- 断点续传状态保留
- 自动 / R2 直连预签名 / Pages 代理传输模式
- 文件下载、代理下载和短时路由令牌
- 上传、下载、删除、移动、复制等关键操作写入审计日志

### 预览能力

- 图片、音频、视频、PDF、文本/代码预览
- 音频播放器和 ArtPlayer 视频播放器
- 不适合网页解码的媒体文件可引导使用本地播放器打开
- Office 文档预览（Microsoft Office Online）
- kkFileView 预览：文本、Office 扩展格式、WPS/OpenDocument、压缩包、图表、部分 CAD/3D/图片格式等
- Photopea 预览/打开：PSD、PSB、AI、RAW
- mLightCAD 预览：DWG、DXF、DWT
- 独立 CAD 预览页：`/cad-viewer`
- 预览提示会说明第三方服务来源和敏感文件风险

### 收藏夹与回收站

- 文件/文件夹收藏
- 收藏夹独立视图
- 删除默认进入回收站
- 回收站列表、恢复、批量恢复
- 管理员/超级管理员可永久删除或清空回收站
- 回收站对象会从普通文件列表和搜索中隐藏

### 分享能力

- 文件和文件夹分享
- 分享有效期：永久、1 天、7 天、30 天等
- 可选提取码
- 分享备注
- 分享链接复制、系统分享面板、二维码预览/保存
- 分享管理：查看、复制、停用、清理已停用/已过期分享
- 公共分享页 `/s/[code]` 支持：
  - 提取码解锁
  - 文件夹浏览
  - 在线预览
  - 文件下载
  - 过期/停用状态提示
- 加密目录内默认禁止创建分享

### 文件夹加密

- 为目录设置访问密码
- 支持密码提示
- 进入加密目录、刷新或下载时按需解锁
- 解锁状态通过短时授权保存
- 支持管理加密状态和更新密码

### 团队、权限与平台视图

- 三角色：`super_admin` / `admin` / `member`
- 自动创建个人团队
- 团队名称修改
- 团队成员列表、添加成员、启用/禁用成员、移除成员
- 成员角色调整
- 成员级权限覆盖，可单独授权或禁用某项能力
- 成员权限申请与管理员审批
- 已批准申请记录清理
- Excel 模板下载与成员批量导入
- 超级管理员跨团队平台摘要：团队数、成员数、桶数、待审批数等

### 审计日志

- 记录上传、下载、重命名、移动、复制、回收、恢复、永久删除、收藏、分享、桶管理等操作
- 支持按桶、动作、成员、时间范围筛选
- 支持清理指定记录或清理团队记录
- 审计日志只对管理员/超级管理员开放

## 技术栈

- **Framework**: Next.js 16 / React 19 / TypeScript
- **UI**: Tailwind CSS 4 / Lucide Icons
- **Auth & DB**: Supabase Auth + Postgres + REST
- **Storage**: Cloudflare R2 S3 API
- **Preview**: ArtPlayer / kkFileView / Microsoft Office Online / Photopea / mLightCAD
- **Deploy**: Cloudflare Pages + `@cloudflare/next-on-pages`

## 项目结构

```text
app/
  page.tsx                 # 主控制台
  s/page.tsx               # 公共分享页入口
  s/[code]/route.ts        # 分享短链跳转
  cad-viewer/page.tsx      # CAD 预览页
  api/[...path]/route.ts   # API 路由分发

components/
  *Preview*                # 音频、视频、Office、文本、本地播放器等预览组件

lib/
  api-routes/              # API 实现：桶、文件、分享、团队、回收站、审计等
  access-control.ts        # 团队 / RBAC / 权限上下文
  user-buckets.ts          # 用户桶配置与凭据解析
  r2-s3.ts                 # R2 S3 请求封装
  shares.ts                # 分享业务
  file-marks.ts            # 收藏夹与回收站业务
  folder-locks.ts          # 文件夹加密业务
  audit-logs.ts            # 审计日志写入
  crypto.ts                # 凭据加密与短时令牌
  supabase.ts              # Supabase REST/Auth 封装

supabase/
  *.sql                    # 数据库初始化脚本
```

## 本地开发

### 环境要求

- Node.js `20+`，建议 `22`
- npm
- 一个 Supabase 项目
- 至少一个 Cloudflare R2 存储桶

### 安装依赖

```bash
npm install
```

### 配置环境变量

本地创建 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

CREDENTIALS_ENCRYPTION_KEY=请使用足够长的随机字符串
ROUTE_TOKEN_SECRET=请使用另一个足够长的随机字符串

# 可选：逗号分隔。未配置时会使用代码中的默认超级管理员邮箱。
SUPER_ADMIN_EMAILS=you@example.com

# 可选：第三方预览服务
NEXT_PUBLIC_KKFILEVIEW_URL=https://preview.example.com
NEXT_PUBLIC_PHOTOPEA_URL=https://www.photopea.com
NEXT_PUBLIC_MLIGHTCAD_VIEWER_URL=/cad-viewer
NEXT_PUBLIC_MLIGHTCAD_URL_PARAM=url
NEXT_PUBLIC_MLIGHTCAD_DATA_BASE_URL=/assets/cad-data
```

### 初始化 Supabase 数据库

在 Supabase SQL Editor 中执行以下脚本。建议按顺序执行：

1. `supabase/user_r2_buckets.sql`
2. `supabase/user_r2_shares.sql`
3. `supabase/app_rbac.sql`
4. `supabase/user_r2_folder_locks.sql`
5. `supabase/user_r2_file_marks.sql`
6. `supabase/user_r2_audit_logs.sql`

说明：

- `user_r2_buckets.sql`：用户/团队 R2 桶配置
- `user_r2_shares.sql`：分享链接、提取码、有效期、访问次数
- `app_rbac.sql`：用户资料、团队、成员、角色、权限、权限申请
- `user_r2_folder_locks.sql`：文件夹加密
- `user_r2_file_marks.sql`：收藏夹与回收站
- `user_r2_audit_logs.sql`：审计日志

### 启动开发服务

```bash
npm run dev
```

常用脚本：

```bash
npm run dev        # Next 本地开发
npm run dev:safe   # 指定 127.0.0.1:3001，并限制 Node 内存
npm run build      # 生产构建
npm run start      # 生产运行
npm run lint       # ESLint
```

## Cloudflare Pages 部署

### 构建设置

- 框架预设：`Next.js`
- 构建命令：`npx @cloudflare/next-on-pages@1`
- 构建输出目录：`.vercel/output/static`
- 根目录：留空或 `/`

### 运行时设置

- 兼容性标志：`nodejs_compat`
- 建议环境变量：`NODE_VERSION=22`

### 生产变量和机密

| 名称 | 必须 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | 服务端管理能力，必须作为机密保存 |
| `CREDENTIALS_ENCRYPTION_KEY` | 是 | 加密 R2 AK/SK，首次上线后不要随意更换 |
| `ROUTE_TOKEN_SECRET` | 强烈建议 | 上传、下载、分享等短时令牌签名 |
| `SUPER_ADMIN_EMAILS` | 可选 | 超级管理员邮箱，逗号分隔 |
| `NEXT_PUBLIC_KKFILEVIEW_URL` | 可选 | kkFileView 服务地址，默认使用项目内配置 |
| `NEXT_PUBLIC_PHOTOPEA_URL` | 可选 | Photopea 地址 |
| `NEXT_PUBLIC_MLIGHTCAD_VIEWER_URL` | 可选 | CAD 预览页地址，默认 `/cad-viewer` |
| `NEXT_PUBLIC_MLIGHTCAD_URL_PARAM` | 可选 | CAD 预览页接收文件 URL 的参数名 |
| `NEXT_PUBLIC_MLIGHTCAD_DATA_BASE_URL` | 可选 | CAD 字体/worker 等静态资源基础路径 |

`SUPABASE_SERVICE_ROLE_KEY`、`CREDENTIALS_ENCRYPTION_KEY`、`ROUTE_TOKEN_SECRET` 不应暴露到客户端。

## Supabase Auth 回调配置

在 Supabase 控制台进入 `Authentication` -> `URL Configuration`：

- `Site URL`：正式站点域名，例如 `https://xxx.pages.dev`
- `Redirect URLs` 至少包含：
  - `https://你的域名/*`
  - `https://*.pages.dev/*`
  - `http://localhost:3000/*`
  - `http://127.0.0.1:3000/*`
  - `http://127.0.0.1:3001/*`（使用 `npm run dev:safe` 时）

否则注册验证、忘记密码、恢复登录等回跳流程可能失败。

## 环境变量兼容别名

项目兼容部分历史变量名，便于旧部署迁移：

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `ACCESS_TOKEN_SECRET`，作为 `ROUTE_TOKEN_SECRET` 的回退
- `R2_SUPER_ADMIN_EMAILS`，作为 `SUPER_ADMIN_EMAILS` 的回退

新部署建议使用正式变量名。

## 权限模型

角色默认权限：

- `super_admin`：拥有全部权限，包含跨团队平台视图和系统管理能力
- `admin`：拥有团队内管理权限，不包含 `sys.*` 平台级权限
- `member`：默认可管理自己账号、查看桶、浏览/读取/搜索文件、查看团队成员、提交权限申请

权限支持两层控制：

- 角色默认权限
- 成员级权限覆盖，可对单个成员单独启用或禁用某项权限

当前权限键包括账号、桶、文件列表/读取/上传/重命名/移动复制/新建/删除/搜索、分享、用量统计、团队成员、角色管理、权限审批和系统统计等。

## 安全说明

- R2 长期凭据加密后存入 Supabase，运行时解密使用
- 上传/下载/对象访问使用短时路由令牌，减少长期凭据暴露面
- 分享提取码使用盐和服务端密钥派生，不明文保存
- 文件夹加密用于目录级访问控制，不等同于对象内容加密
- 第三方在线预览可能把临时文件 URL 交给外部服务处理，敏感文件建议下载后在可信本地环境打开
- `CREDENTIALS_ENCRYPTION_KEY` 更换会导致历史桶密钥无法解密，除非先做迁移

## 首次上线自检

1. 注册账号、邮箱验证、登录
2. 忘记密码邮件回跳和重置密码
3. 新增 R2 存储桶并通过连接校验
4. 浏览文件列表，新建文件夹，上传小文件
5. 上传大文件，测试暂停、继续和取消
6. 预览图片、PDF、文本、Office/CAD 或设计文件
7. 重命名、移动、复制、收藏、移入回收站、恢复
8. 创建分享链接，测试提取码、二维码、公共分享页下载
9. 设置文件夹密码，测试解锁和刷新后的访问
10. 添加团队成员，测试权限申请和审批
11. 查看审计日志和平台摘要

## 已知限制

- 文件夹分享支持浏览和文件下载，但“整个文件夹打包下载”不是当前主流程
- 复杂 Office、CAD、设计文件的预览效果取决于第三方服务和浏览器能力
- `app/page.tsx` 目前承载了较多控制台逻辑，后续维护应优先按功能拆分组件和 hooks
- 缺少 `SUPABASE_SERVICE_ROLE_KEY` 时，注册邮箱去重、团队管理、账号注销、审计清理等服务端管理能力会受影响

## 适用场景

- 个人博客图床和静态资源管理
- 多桶、多账号 R2 文件管理
- 小团队资源协作与权限审批
- 对外文件分享和临时交付
- 需要回收站、审计日志和目录访问控制的 R2 管理场景
