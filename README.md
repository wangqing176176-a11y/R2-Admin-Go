# **R2 Admin Go 部署教程（Cloudflare 中文界面）**

## **简介**

R2 Admin Go 是一个部署在 **Cloudflare Pages** 上的 R2 文件管理面板，支持用户注册登录、绑定个人 R2 存储桶并进行文件管理，无需自建服务器。

当前版本已改为 **Supabase 账号体系 + 前端绑定桶配置**，不再依赖旧版 `ADMIN_USERNAME/ADMIN_PASSWORD` 登录方式。

## **功能**

- 用户注册、邮箱验证、登录、忘记密码、修改密码
- 单账号绑定多个 R2 存储桶（新增 / 编辑 / 删除 / 切换默认桶）
- 文件与文件夹浏览、上传、下载、重命名、移动、复制、删除、新建文件夹
- 大文件分片上传（暂停 / 继续 / 取消）
- 在线预览：图片 / 音频 / 视频 / PDF / 代码 / Office
- 传输模式：自动 / R2 直连 / Pages 代理
- 界面主题切换：跟随系统 / 浅色 / 深色

## **部署前准备（Supabase）**

### 第一步：创建 Supabase 项目

- 在 Supabase 新建项目
- 获取以下信息：
1. Project URL
2. Project API key（publishable / anon）
3. Service role key（用于“注销账号”接口）

### 第二步：创建数据表与 RLS

- 打开 Supabase -> `SQL Editor`
- 依次执行项目内 SQL 文件：
1. `supabase/user_r2_buckets.sql`
2. `supabase/user_r2_shares.sql`
3. `supabase/app_rbac.sql`（三角色权限、团队成员、权限申请）

## **部署到 Cloudflare Pages（中文界面）**

### 第一步：创建 Pages 项目

- Cloudflare 控制台 -> `计算和 AI` -> `Workers 和 Pages` -> `创建` -> `Pages`
- 连接 Git 仓库并选择本项目

### 第二步：构建设置

- `框架预设`：`Next.js`
- `构建命令`：`npx @cloudflare/next-on-pages@1`
- `构建输出目录`：`.vercel/output/static`
- `根目录`：留空（或 `/`）

### 第三步：运行时设置

- 进入 Pages 项目 -> `设置` -> `运行时`（或函数相关设置）
- 添加 `兼容性标志`：`nodejs_compat`
- 可选：添加环境变量 `NODE_VERSION=22`（推荐）

### 第四步：变量和机密（生产 / 预览都要配）

进入 `设置` -> `变量和机密`，添加：

| 名称 | 类型建议 | 说明 |
| ---- | ---- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | 文本 | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 文本 | Supabase publishable/anon key |
| `CREDENTIALS_ENCRYPTION_KEY` | 密钥 | 用于加密存储桶密钥，建议 32 位以上随机字符串 |
| `ROUTE_TOKEN_SECRET` | 密钥 | 用于签发临时路由令牌，建议 32 位以上随机字符串 |
| `SUPABASE_SERVICE_ROLE_KEY` | 密钥 | 用于注销账号（服务端调用 Supabase Admin API） |

> `SUPABASE_SERVICE_ROLE_KEY` 必须配置为 **机密变量**，仅服务端使用，不要暴露到前端。

### 第五步：部署

- 保存后执行部署（或推送代码触发自动部署）

## **Supabase 回调地址配置（很关键）**

Supabase -> `Authentication` -> `URL Configuration`：

- `Site URL`：你的正式站点域名（例如 `https://xxx.pages.dev` 或自定义域名）
- `Redirect URLs` 至少添加：
1. `https://你的域名/*`
2. `https://*.pages.dev/*`
3. （本地调试可选）`http://localhost:3000/*`
4. （本地调试可选）`http://127.0.0.1:3000/*`

否则会出现“忘记密码链接跳回登录页但不进入重置流程”等问题。

## **上线后自检**

按顺序验证以下流程：

1. 新用户注册 -> 邮箱验证 -> 登录
2. 忘记密码 -> 邮件链接 -> 设置新密码
3. 账号中心新增桶 -> 读取文件列表
4. 修改密码后需要重新登录

## **旧版变量说明（已不推荐）**

以下旧变量在当前账号体系下不是必需：

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

当前推荐做法是：用户登录后在前端绑定自己的桶配置。
