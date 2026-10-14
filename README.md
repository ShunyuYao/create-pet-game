# create-pet-game

一个可独立安装的 Codex skill：按用户选择的玩法，生成能导入兼容桌宠、邀请好友局域网联机的单文件 HTML 小游戏。制作过程不需要桌宠源码仓库，玩法不限于固定模板。

## 安装和使用

制作环境：Codex、Node.js 22+。浏览器检查另需 Chrome/Chromium。

```sh
git clone https://github.com/hyusi2003/create-pet-game.git
cd create-pet-game
node install.mjs
```

安装后新开 Codex 会话，输入：

> $create-pet-game 帮我做一个双人局域网井字棋，中文界面，用桌宠当头像，先让我选择规则，最后生成能导入桌宠的 HTML。

技能会引导确认必要的玩法选择，实现游戏并进行打包、兼容检查及可用环境下的操作验证。支持提问选项卡的环境使用选项卡，其余环境通过聊天选择。

**Skill 装进 Codex，生成的 HTML 导入桌宠。** 玩家无需 Node、模型 API Key、自建服务器或源码。真实联机需要支持 HTML/work SDK v2、`sessions:connect` 和作品邀请的桌宠客户端；普通浏览器打开只是本地预览。

完整说明见 [INSTALL.md](INSTALL.md)。也可下载 [独立技能压缩包](dist/create-pet-game-0.2.0.zip)，解压后运行安装器。安装器默认使用 `$CODEX_HOME/skills`，未设置时使用 `~/.codex/skills`，已有同名技能不会被覆盖。

## 桌宠形象和风格

0.2.0 增加完整角色预览、可选 2D 姿势、透明边距裁剪、授权失败后的重试和 `getRealtime()` 外观读取。随包渲染器将兼容的 rat-doll v2 换装外观渲染为透明角色图；不需要私有素材包或 CDN，图片在游戏运行时从玩家宿主授权读取。默认提供原作暖纸板/玩具感等风格选择，明确偏好优先。

3D 支持限于此渲染器数据版本，输出 idle/walk 正面姿势，不是通用模型/连续动画或四肢编辑器。浏览器预览不能读取桌宠，会明确提示，也可由用户主动上传透明图片。

## 示例

[桌宠突击 HTML](examples/pet-strike.html) 展示纸板掩体射击、完整桌宠预览和场景角色，源码位于 [examples/pet-strike](examples/pet-strike)。

[桌宠井字棋 HTML](examples/pet-tictactoe.html) 是仅依据本技能独立生成的作品，源码位于 [examples/tictactoe](examples/tictactoe)。从桌宠文件发送入口选择同网好友，选择「发送并一起玩」，双方接受邀请、配对和能力授权后准备开局。

示例用于展示完整流程，不限制你制作射击、赛车、合作闯关或其他玩法。复杂玩法仍需限定小游戏范围并单独验证性能。

## 仓库内容

- `create-pet-game/`：技能说明、SDK 契约、独立桥接、起始工程和 Node 工具。
- `install.mjs`：将技能复制到当前 Codex 的技能目录。
- `examples/`：可导入的示例和可修改源码。
- `tests/`：无需桌宠仓库即可运行的制作、浏览器和模拟协议检查。
- `package_skill.py`：使用明确文件清单生成分发 ZIP 与 SHA-256。

## 验证

```sh
npm test
npm run test:browser
npm run test:character-browser
node tests/example-protocol.mjs
node tests/example-gameplay.mjs examples/pet-tictactoe.html --out evidence/example
npm run pack
```

安装 skill、制作游戏及运行检查无需 npm 依赖；打包另需 Python 3。维护者修改随包 3D 组件源码后，运行 `npm ci && npm run build:character` 重建已提交的 IIFE。第三方源码、版本和许可位于 `create-pet-game/assets/character/`。已完成独立目录构建、ZIP 安装、浏览器真实输入和模拟协议验证。维护者另外在两个隔离的真实桌宠进程中验证过文件发送、邀请配对、授权、头像交换、对局、重开及退出；这些宿主测试不构成公开客户端版本兼容承诺。

尚未验证物理双机 LAN、Windows 安装、跨子网/防火墙环境。模拟协议、同机双实例和物理双机测试是不同的证据。

## 许可

[MIT](LICENSE)。桥接和示例许可会随 HTML 保留；不改变用户原创游戏内容的权利，第三方素材另遵守其许可。本仓库不提供桌宠宿主源码、安装包或私有角色资产。
