# kidChinese · 小学生认字

一年级识字 H5：主页认字、练习录音、历史回放。

在线访问（GitHub Pages）：

https://a383219087.github.io/kidChinese/

## 功能

- **主页**：一上 / 一下切换，组词与造句，可开拼音
- **练习**：先选册次，随机 20 字，可录音（不评分）
- **历史记录**：回放练习录音

录音保存在浏览器本地 IndexedDB，不会上传服务器。

## 本地开发

```bash
npm install
npm run dev
```

## 构建与部署

用 Node.js 构建静态站点，由 GitHub Actions 自动发布到 Pages：

```bash
npm ci
npm run build
```

推送到 `main` 后会自动部署。也可在仓库 Actions 里手动运行 **Deploy to GitHub Pages**。
