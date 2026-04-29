# Pet Portal App

面向 Shopify 的嵌入式应用示例。基于 React Router + Shopify App React Router + Prisma（Supabase Postgres）构建，包含：
- Shopify 管理后台内嵌页面
- Admin GraphQL 示例（创建产品、更新变体、写入 metaobject）
- Webhook 处理（卸载与权限变更）

这份 README 以“初学者可直接上手”为目标。

## 快速开始（本地开发）

1. 安装依赖

```bash
pnpm install
```

2. 通过 Shopify CLI 启动开发

```bash
pnpm dev
```

第一次运行时 Shopify CLI 会引导你：登录账号、选择/创建测试店铺、生成所需环境变量并建立本地隧道。

3. 打开应用

终端里按 `P` 打开应用地址，在测试店铺里完成安装即可开始开发。

## 你需要准备

- Node.js `>=20.19 <22` 或 `>=22.12`
- Shopify CLI
- 一个 Shopify Partner 账号 + 测试店铺（开发用）

## 项目结构一览

```
app/
  routes/
    app._index.tsx          # 应用首页（GraphQL 示例）
    app.additional.tsx      # 示例“额外页面”
    app.tsx                 # 应用框架与导航
    auth.$.tsx              # 认证入口
    webhooks.app.uninstalled.tsx
    webhooks.app.scopes_update.tsx
  shopify.server.ts         # Shopify 配置与鉴权
  db.server.ts              # Prisma Client
  root.tsx                  # HTML shell
prisma/
  schema.prisma             # Postgres 数据模型（Session / WelcomeEmailLog）
shopify.app.toml            # Shopify 应用配置（webhooks / scopes / metaobjects）
shopify.web.toml            # 本地开发命令配置
```

## 主要功能说明

- 应用首页：`app/routes/app._index.tsx`
  - 按钮触发 `action`，调用 Admin GraphQL 创建产品、更新变体、写入 metaobject
  - 生成后在页面中展示 JSON 结果

- 应用框架与导航：`app/routes/app.tsx`
  - 使用 `<AppProvider embedded>` 让应用嵌入 Shopify Admin
  - 左侧导航包含“Home”和“Additional page”

- Webhook
  - `app/uninstalled`：卸载后清理会话
  - `app/scopes_update`：权限变更后同步 scope

## 常用命令

- 开发模式：

```bash
pnpm dev
```

- 构建（纯编译，不改数据库）：

```bash
pnpm build
```

- 启动生产构建：

```bash
pnpm start
```

- 初始化数据库（生产或首次部署）：

```bash
pnpm setup
```

- 类型检查：

```bash
pnpm typecheck
```

## 数据库（Prisma + Supabase Postgres）

默认使用 Supabase Postgres，通过 Prisma 连接。

- `DATABASE_URL`：应用运行时连接（推荐 Supabase pooler 连接）
- `DIRECT_URL`：迁移时连接（Supabase direct 连接）

运行 `pnpm setup` 会执行项目内的幂等 SQL bootstrap，在目标 Postgres 中补齐 `Session`、`WelcomeEmailLog` 和 `pet_profiles` 所需表结构。

注意：`pnpm build` 不会执行数据库变更。部署到 Vercel 时，避免把 `pnpm setup` 放进 Build Command；数据库初始化或补结构应单独执行，否则构建阶段会对生产库重复写入/建索引，导致部署失败。

## 如何新增页面

1. 在 `app/routes` 下新增一个文件，例如 `app/routes/app.pets.tsx`
2. 在 `app/routes/app.tsx` 里添加导航链接：

```tsx
<s-link href="/app/pets">Pets</s-link>
```

## 常见问题

- 提示 `Session` 表不存在
  - 运行 `pnpm setup` 生成并迁移数据库

- 内嵌应用跳转异常
  - 使用 React Router 的 `Link` 组件或 Shopify Polaris 的导航组件
  - 不要使用普通 `<a>` 标签跳转

## 关键配置文件

- `shopify.app.toml`
  - 应用名称、访问权限 scopes、webhooks、metaobjects 定义
  - 部署前需要把 `application_url` 和 `auth.redirect_urls` 改成你的实际域名
- `shopify.web.toml`
  - 本地开发时的前端/后端命令
- `vite.config.ts`
  - Vite 服务端口、HMR、允许的 host 配置

## 进一步开发建议

- 把 `app/routes/app._index.tsx` 中的 GraphQL 示例替换为你自己的业务逻辑
- 需要更多页面时，新增路由并在导航中展示
- 需要外部数据存储时，替换 Prisma 的 datasource

## License

MIT
