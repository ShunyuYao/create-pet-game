# 以 ShunyuYao 的游戏为制作参考

新作品默认参考作者公开游戏的 3D 场景、玩具道具和布偶角色呈现，按需求设计自己的规则。本技能生成的 `examples/pet-strike`、井字棋及 `assets/starter` 仅作打包/权限/桥接回归夹具，不决定新游戏的视觉、视角、动作或类型。用户明确指定 2D 或其他参考时优先遵从。

## 按玩法选择源码

以下为 2026-10-14 已读取的公开源码快照。先读相关 README，再读表内实现；固定采用的提交、依赖版本与许可，不能把最新版 API 和旧快照混用。若原仓库更新，以实际读取的源码和当前宿主契约重新核对。

| 项目 / 已读提交 | 借鉴点 | 优先读的文件 |
| --- | --- | --- |
| [pet-kart](https://github.com/ShunyuYao/pet-kart/tree/5f901560fb8a109cce42f3f224afb0d45b293c9f) | 完整 3D 赛道、跟随相机、玩具车与坐姿车手，站姿领奖台和实时颁奖。适合驾驶、空间移动、结算演出；远端车辆按房主比赛时间平滑。 | `src/scene.js`、`avatars.js`、`characters.js`、`ceremony.js`；`game/sim.cjs`、`room.cjs`、`remote-motion.cjs` |
| [pet-tank](https://github.com/ShunyuYao/pet-tank/tree/9d34a0eccb14332121aa3cb895c83a1064875331) | 俯斜相机、积木地形、可破坏墙、炮塔坐姿布偶。适合网格场景、载具和合作守家。 | `src/scene.js`、`avatars.js`；`game/` 规则；`vendor/pet-kit/` 固定公共层 |
| [pet-bomb](https://github.com/ShunyuYao/pet-bomb/tree/8f9ac432b3a54c807ae6c4fa689ea20c43607944) | 俯斜 3D 格子场、立体水球/道具、行走布偶。适合房间内走动、互动工作台、爆炸/泡泡效果。 | `src/scene.js`、`avatars.js`；`game/` 规则；`vendor/pet-kit/` |
| [pet-paint](https://github.com/ShunyuYao/pet-paint/tree/acfa928b9cc5c45700f5ebcd8c79a93e9e65e44c) | 3D 书桌、地面覆盖、瞄准方向与持物角色。适合表面交互、方向操作和持续状态。 | `src/scene.js`、`avatars.js`、`characters.js`；`game/` |
| [pet-brawl](https://github.com/ShunyuYao/pet-brawl/tree/ccd0acab497441ae8e35fc221a26345cdb4ccb67) | 侧视平台规则、3D 场景/骨架动作、武器姿势与受击翻滚；本地预测、客人自身绘制校正和远端平滑。适合角色动作、跳跃、击退。侧视规则不等于角色只能画成 2D。 | `src/scene.js`、`avatars.js`、`poses.js`；`game/match.cjs`、`net.cjs`、`local-motion.cjs`、`remote-motion.cjs` |
| [pet-hide-duel](https://github.com/ShunyuYao/pet-hide-duel/tree/276d0204d5211c4318cdc7b2cf563080e565be87) | 可交互的 3D 摆姿势；确认后固定正面图，遮挡和命中共用轮廓。适合需要姿势编辑或轮廓公平的玩法，**不是连续 3D 场景模板**。 | `game/doll-editor.mjs`、`doll-pose.mjs`、`doll-assets.mjs`、`client.js` |

借鉴公共结构时分开看 [pet-kit](https://github.com/ShunyuYao/pet-kit/tree/c30592f1656438a72b165e3d00d609519454808a) 的 `src/room.js`（会话、确认、预算）和 `src/looks.js`（当前形象及角色数据）。骨架、头部与服装来源见 [pet-ragdoll-renderer](https://github.com/ShunyuYao/pet-ragdoll-renderer/tree/73ce21b3d8d7f7398b1d389329a6c65cb69ee2ee)。它们是公共素材/代码契约参考，不要求玩家安装这些制作工具。

联机实现还须参考 [大乱斗与赛车的实际修复](network-lessons.md)：10-14 的自身回拉与远端停跳，以及之前的 ACK 时间线、重复传形象、晚加入/乱序和准备恢复。公共套件快照与作品自己的 vendor 版本分别核对，不能将索引中的 pet-kit 提交当成所有游戏当前使用的版本。

## 3D 制作路径

1. 选择相关场景方向，例如合作做饭可以参考水球/颜料的俯斜场景、坦克的道具比例，重做成厨房；不要套用射击规则。
2. 将场景、角色适配、纯规则和会话层分开；场景从游戏状态呈现，规则由房主裁定。用真实地面/工作台/道具几何、光照、遮挡、相机与逐帧动作建立空间感。
3. 在作品自己的构建链里固定并打包 Three.js 等必要引擎，最终输出内联 IIFE 和资源、保留许可；运行时无 CDN。参考项目的 Three.js 0.164.1 / cannon-es 0.20.0 是该快照的组合，不是要求所有新项目使用这两版。实现第三方 API 前查该版本官方文档。
4. 读取 `character.getRealtime()` 的兼容数据与素材，建立本地实时布偶、头部与服装，按玩法应用站/坐/走/持物动作。双方各读取自己的角色，素材经授权会话交换一次，帧状态只传操作/姿势/位置。不要把整套素材每帧重发。
5. `PetCharacter.normalize()` / `PetDollSprite` 输出的是正面 PNG 姿势，适合 2D 或选定的剪影玩法；它们不能代替实时场景的骨架对象。不要先压成 PNG，再称为实时 3D 换装/动作。也不要将宿主 renderer 插件的 `pet.render` 私有渲染桥当作 HTML 作品 API；成品只能用公开 `window.pet`。
6. 合法的 2D 桌宠可以在 3D 场景内保留其立绘身份；与 3D 布偶共用规则但分别呈现。普通浏览器可用清楚标注的练习角色。实际角色读取失败时提示并重试，不能用另一只默认宠物掩盖失败。

这些项目的当前源码还包含 4 人房间、`transport:auto` 和中转候选；**本 skill 的便携构建器/校验器仍限定双人 LAN**。参考 3D 画面不构成扩展宿主协议的授权，也不能直接拿这些 HTML 过本技能的双人校验。需要更多人数/互联网时按实际宿主另行适配、声明和验证。

## 视觉与验收

参考的是空间、角色、材质与交互方法；不同项目的暖纸板、玩具房、彩色赛道不必统一成一个配色。先服从用户指定美术，再选与规则相符的相机。仅增加投影、阴影或 DOM transform 不能证明已经做了 3D 场景。

截图需覆盖大厅、动作中、结算：能辨认自己与对方、衣服/头像一致、朝向/动作正确、地面和道具层级可读。实际测试 WebGL 渲染、真实输入、双方状态、窗口缩放及销毁后资源清理；分别报告模拟外观与真实宿主数据。源码参考经过读取不等于这些参考游戏在当前设备上重测通过。

## 许可

赛车、坦克、水球、颜料、大乱斗及公共套件按各仓库当前许可使用，复制代码需保留许可与改动说明。本表只链接/解释源码，不内嵌其实现或私人角色。躲猫猫原创实现保留版权，公开可读不等于可复制；这里只借鉴行为和设计，不能直接 vendor 其原创代码。
