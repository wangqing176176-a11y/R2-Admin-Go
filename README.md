# R2 Admin Go

一个面向 **Cloudflare R2** 的完整文件管理面板，适合个人图床、博客资源管理，也支持小团队协作管理。

项目当前采用：
- **Next.js App Router**
- **Cloudflare Pages（推荐部署）**
- **Supabase 账号体系 + RBAC 权限**
- **用户自行绑定 R2 存储桶（支持多桶 / 多账号）**

如果你和作者一样把 R2 当博客图床来用，这个项目的定位就是：把 R2 官方控制台里不顺手、受限的文件操作体验补齐。

## 功能总览

### 1. 账号与认证
- 用户注册（邮箱验证码）
- 登录 / 退出登录
- 忘记密码（邮箱恢复）
- 登录后修改密码
- 注销账号（需服务端管理员密钥）
- 记住登录状态 / 会话恢复

### 2. 存储桶管理（多桶）
- 每个账号可绑定多个 R2 存储桶
- 新增 / 编辑 / 删除存储桶配置
- 设置默认桶
- 支持混用多个 Cloudflare 账号的桶
- 存储桶连接校验与错误提示（中文化）

### 3. 文件与文件夹管理
- 文件列表浏览（列表/网格视图）
- 文件夹进入 / 返回 / 面包屑导航
- 新建文件夹
- 上传文件
- 下载文件
- 重命名文件 / 文件夹
- 移动 / 复制（单个或批量）
- 删除（文件 / 文件夹）
- 多选操作
- 全局搜索（按关键字）
- 文件类型图标与分类展示

### 4. 上传与传输能力
- 单文件上传
- 大文件分片上传（Multipart）
- 上传暂停 / 继续 / 取消
- 上传队列管理
- 断点续传状态保留（提升大文件上传稳定性）
- 传输模式切换：
  - 自动
  - R2 直连（预签名）
  - Pages 代理

### 5. 文件预览与下载体验
- 图片 / 音频 / 视频 / PDF 预览
- 文本 / 代码类内容预览
- Office 文档类型识别（按类型展示与处理）
- 批量下载（文件）
- 详情面板查看文件信息

### 6. 分享能力（内置分享页）
- 文件 / 文件夹分享
- 分享链接管理（创建 / 停用 / 清理）
- 分享有效期设置
- 分享提取码（可选）
- 分享二维码预览 / 保存（界面能力）
- 公共访问页（`/s`）支持：
  - 提取码解锁
  - 文件夹浏览
  - 在线预览
  - 下载

### 7. 文件夹加密（目录级访问控制）
- 为文件夹设置访问密码（加密文件夹）
- 进入/刷新时按需解锁
- 支持加密提示（hint）
- 管理员可维护加密状态和密码

### 8. 团队与权限（RBAC）
- 三角色体系：`super_admin` / `admin` / `member`
- 团队成员管理
- 成员启用/禁用
- 成员角色调整
- 权限明细与授权覆盖（override）
- 权限申请与审批流程（request / review）
- 批量导入成员（Excel 模板）
- 平台摘要/控制台（超级管理员能力）

### 9. 账号中心与平台体验
- 账号中心（个人信息、密码、权限概览）
- 深色 / 浅色 / 跟随系统主题
- 移动端适配（抽屉/底部面板）
- 中文错误提示与交互反馈（toast）

## 项目亮点

- **面向真实使用场景**：不是演示项目，适合长期管理 R2 图床/资源。
- **Serverless 部署**：推荐 Cloudflare Pages，无需自建传统后端服务器。
- **多桶多账号支持**：每个用户可绑定多个 R2 桶，适合个人与团队场景。
- **权限模型完整**：不是单管理员面板，支持团队与权限审批。
- **分享与访问控制兼顾**：分享链接、提取码、目录加密并存。
- **上传链路完整**：支持分片上传、暂停/恢复、队列管理。
- **安全设计到位**：桶密钥服务端加密保存，临时路由令牌隔离敏感凭据。

## 技术栈

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI**: Tailwind CSS 4, Lucide Icons
- **Auth / DB**: Supabase（Auth + Postgres + REST）
- **Storage**: Cloudflare R2（S3 API）
- **Deployment**: Cloudflare Pages（推荐）+ `next-on-pages`

## 架构说明（简版）

- 前端页面：`app/page.tsx`（主控制台） + `app/s/page.tsx`（公共分享页）
- API 路由：`app/api/*`（Next Route Handlers）
- 权限与团队：`lib/access-control.ts`
- R2 S3 签名与访问：`lib/r2-s3.ts`
- 用户桶配置与凭据解析：`lib/user-buckets.ts`
- 分享能力：`lib/shares.ts` / `lib/share-token.ts`
- 文件夹加密：`lib/folder-locks.ts` / `lib/folder-lock-access.ts`

## 适用场景

- 个人博客图床（R2）
- 静态资源素材仓库
- 小团队文件协作 / 分享
- 需要一个比 R2 官方界面更顺手的管理面板

## 本地开发（快速开始）

### 1. 环境要求

- Node.js `20+`（建议 `22`）
- npm
- 一个 Supabase 项目
- 至少一个 Cloudflare R2 存储桶（用于实际测试）

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 `.env.local`

至少配置以下环境变量（推荐全部使用 `NEXT_PUBLIC_*` / 正式名称）：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

CREDENTIALS_ENCRYPTION_KEY=请使用足够长的随机字符串
ROUTE_TOKEN_SECRET=请使用足够长的随机字符串（建议与上面不同）

# 可选：逗号分隔，配置超级管理员邮箱
SUPER_ADMIN_EMAILS=you@example.com
```

### 4. 初始化 Supabase 数据库

打开 Supabase `SQL Editor`，执行项目内 SQL 文件（至少以下四个）：

1. `supabase/user_r2_buckets.sql`
2. `supabase/user_r2_shares.sql`
3. `supabase/user_r2_folder_locks.sql`
4. `supabase/app_rbac.sql`

说明：
- `app_rbac.sql` 包含团队、成员、角色、权限、权限申请等模型
- `user_r2_folder_locks.sql` 用于目录加密功能

### 5. 启动开发环境

```bash
npm run dev
```

可用脚本：

```bash
npm run dev        # Next 本地开发
npm run dev:safe   # 更保守的本地开发模式（内存限制 + 指定端口）
npm run build      # 生产构建（Next）
npm run start      # 生产运行
npm run lint       # ESLint
```

## Cloudflare Pages 部署（推荐）

### 1. 构建设置

- 框架预设：`Next.js`
- 构建命令：`npx @cloudflare/next-on-pages@1`
- 构建输出目录：`.vercel/output/static`
- 根目录：`/`（留空也可）

### 2. 运行时设置

- 兼容性标志：`nodejs_compat`
- 可选：`NODE_VERSION=22`

### 3. 变量和机密（生产 / 预览都要配）

| 名称 | 是否必须 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 必须 | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必须 | Supabase Anon / Publishable Key |
| `SUPABASE_SERVICE_ROLE_KEY` | 必须 | 服务端管理能力（注册邮箱去重、团队管理、账号注销等） |
| `CREDENTIALS_ENCRYPTION_KEY` | 必须 | 加密存储桶密钥（AK/SK） |
| `ROUTE_TOKEN_SECRET` | 强烈建议 | 临时路由令牌签名/密封（建议独立于加密密钥） |
| `SUPER_ADMIN_EMAILS` | 可选 | 超级管理员邮箱列表（逗号分隔） |

> `SUPABASE_SERVICE_ROLE_KEY` 必须配置为机密变量，仅服务端使用。

## Supabase Auth 回调配置（重要）

在 Supabase -> `Authentication` -> `URL Configuration` 中配置：

- `Site URL`：你的正式站点域名（如 `https://xxx.pages.dev`）
- `Redirect URLs` 至少包含：
  - `https://你的域名/*`
  - `https://*.pages.dev/*`
  - `http://localhost:3000/*`（本地调试可选）
  - `http://127.0.0.1:3000/*`（本地调试可选）

否则注册验证 / 忘记密码回跳流程可能无法正常工作。

## 环境变量兼容别名（历史兼容）

项目对以下别名做了兼容（便于迁移），但新部署建议优先使用正式名称：

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（等价 anon key）
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `ACCESS_TOKEN_SECRET`（`ROUTE_TOKEN_SECRET` 的兼容回退）
- `R2_SUPER_ADMIN_EMAILS`（`SUPER_ADMIN_EMAILS` 的兼容回退）

## 首次上线后自检清单

建议按顺序验证：

1. 注册账号 -> 邮箱验证 -> 登录
2. 忘记密码 -> 邮件链接 -> 设置新密码
3. 新增 R2 存储桶 -> 读取文件列表
4. 上传文件（小文件 / 大文件）
5. 文件预览 / 下载 / 重命名 / 移动 / 删除
6. 创建分享链接 -> 公共分享页访问
7. 文件夹加密 -> 解锁访问
8. 团队成员 / 权限申请（如开启团队协作）

## 权限模型说明（简版）

角色：
- `super_admin`：平台级能力（含系统级查看/管理）
- `admin`：团队管理员（通常包含非系统类权限）
- `member`：协作成员（默认只读/申请式权限）

同时支持：
- 角色默认权限
- 成员级权限覆盖（允许/禁用）
- 权限申请与审批记录

## 安全设计说明

- **R2 凭据加密保存**：用户绑定的 `Access Key ID / Secret Access Key` 在服务端加密后存储
- **临时路由令牌**：下载/上传等路径使用短时令牌，避免直接暴露长期敏感信息
- **目录级加密**：支持文件夹访问密码（非公开目录场景）
- **分享访问控制**：分享可设置提取码和有效期

## 当前已知限制 / 说明

- 文件夹“整体打包下载”暂未完整实现（当前以文件下载为主）
- 项目功能丰富，`app/page.tsx` 体量较大；稳定优先时建议谨慎重构
- 若缺少 `SUPABASE_SERVICE_ROLE_KEY`，部分功能（如注册邮箱去重、账号注销、团队管理）会受影响

## 项目结构（精简版）

```text
app/
  page.tsx                 # 主控制台（登录 + 文件管理 + 团队/分享等）
  s/page.tsx               # 公共分享页
  api/*                    # 路由接口（桶、文件、分享、权限、团队等）

lib/
  access-control.ts        # RBAC / 团队 / 权限
  user-buckets.ts          # 用户桶配置与凭据解析
  r2-s3.ts                 # R2 S3 签名、请求封装
  shares.ts                # 分享业务
  folder-locks.ts          # 文件夹加密业务
  supabase.ts              # Supabase REST/Auth 封装
  crypto.ts                # 凭据加密与令牌密封

supabase/
  *.sql                    # 数据库初始化脚本
```

## 适合如何使用（建议）

- 自用图床：优先关注“多桶管理 + 上传 + 链接复制 + 预览”
- 小团队协作：启用 RBAC、成员管理、权限申请
- 对外分享：启用分享链接、提取码、有效期
- 私密目录：使用文件夹加密功能

## 致开发者（维护建议）

当前项目已经是产品级功能体量，建议维护策略：
- **稳定优先**：功能稳定时避免大规模无收益重构
- **按模块迭代**：新增功能尽量拆到组件/模块中，减少 `app/page.tsx` 继续膨胀
- **先做低风险清理**：死代码、未使用资源、未使用状态/函数优先

---

如果你觉得这个项目对你的 R2 使用场景有帮助，欢迎继续按自己的流程打磨它。这个项目本质上就是一个“从真实痛点里长出来”的 R2 管理工具。
