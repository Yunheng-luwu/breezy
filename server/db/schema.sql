-- ========================================================
-- 松序（Breezith）业务数据库结构
-- 兼容 MySQL 5.7+ / MariaDB 10.3+（云服务器为 MariaDB）
-- 使用方式：node server/db/initDb.js
-- ========================================================

CREATE DATABASE IF NOT EXISTS songxu
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE songxu;

-- ============ 用户与档案 ============

-- 用户表（账号密码注册；含内嵌 AI 兼容字段 name；phone 保留给演示用户）
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50) NULL,
  email         VARCHAR(100) NULL,
  password_hash VARCHAR(120) NULL COMMENT 'scrypt:salt:hash',
  phone         VARCHAR(20) NULL,
  name          VARCHAR(50) NOT NULL DEFAULT '小松',
  role          VARCHAR(10) NOT NULL DEFAULT 'user' COMMENT 'admin=管理员 user=普通用户',
  score         TINYINT UNSIGNED NULL DEFAULT NULL COMMENT '肝郁指数 0-100（NULL=未测评）',
  level         VARCHAR(20) NULL DEFAULT NULL COMMENT '测评等级（NULL=未测评）',
  avatar        VARCHAR(255) NULL COMMENT '头像：预设key p1-p10 或上传路径 /uploads/avatars/*',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_phone (phone),
  UNIQUE KEY uk_username (username),
  UNIQUE KEY uk_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 健康档案表
CREATE TABLE IF NOT EXISTS health_profiles (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  constitution  VARCHAR(50) NULL COMMENT '中医体质',
  allergy       VARCHAR(255) NULL COMMENT '过敏史',
  diet_pref     VARCHAR(200) NULL COMMENT '饮食偏好',
  exercise_pref VARCHAR(200) NULL COMMENT '运动习惯',
  sleep_pref    VARCHAR(200) NULL COMMENT '作息规律',
  body_sense    VARCHAR(200) NULL COMMENT '体感敏感度',
  wake_time     VARCHAR(5)  NULL COMMENT '目标起床时间 HH:mm',
  nap_time      VARCHAR(5)  NULL COMMENT '目标午憩时间 HH:mm',
  bed_time      VARCHAR(5)  NULL COMMENT '目标入睡时间 HH:mm',
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user (user_id),
  CONSTRAINT fk_bp_profile_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 慢病档案表（分步问卷采集，供 AI 安全提醒；JSON 字段以 TEXT 存储兼容 MariaDB 10.3）
CREATE TABLE IF NOT EXISTS chronic_profiles (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  has_disease TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否有已确诊慢病',
  diseases    TEXT NULL COMMENT '慢病列表 JSON: [{name, years}]',
  has_meds    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否长期服药(3个月以上)',
  meds        TEXT NULL COMMENT '长期用药 JSON: [{name, dose}]',
  pregnancy   VARCHAR(12) NOT NULL DEFAULT 'none' COMMENT 'none/trying/pregnant/breastfeeding',
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_chronic_user (user_id),
  CONSTRAINT fk_chronic_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话表（内嵌 AI 使用）
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(100) NOT NULL DEFAULT '新的对话',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  CONSTRAINT fk_bp_session_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 消息表（内嵌 AI 使用）
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id  BIGINT UNSIGNED NOT NULL,
  role        ENUM('system','user','assistant') NOT NULL,
  content     TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session (session_id),
  CONSTRAINT fk_bp_message_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 业务数据 ============

-- 待办事项
CREATE TABLE IF NOT EXISTS todos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  content     VARCHAR(255) NOT NULL,
  todo_time   VARCHAR(10) NOT NULL DEFAULT '' COMMENT '提醒时刻 HH:mm',
  type        VARCHAR(10) NOT NULL DEFAULT 'ai' COMMENT 'med/ai/sleep/diet',
  is_done     TINYINT(1) NOT NULL DEFAULT 0,
  todo_date   DATE NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_todo_user_date (user_id, todo_date),
  CONSTRAINT fk_bp_todo_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 症状记录
CREATE TABLE IF NOT EXISTS symptoms (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  symptom     VARCHAR(50) NOT NULL,
  severity    VARCHAR(20) NOT NULL DEFAULT '轻度',
  cause       VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bp_symptom_user (user_id),
  CONSTRAINT fk_bp_symptom_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用药提醒
CREATE TABLE IF NOT EXISTS medicines (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(100) NOT NULL,
  dose          VARCHAR(50) NOT NULL DEFAULT '',
  med_time      VARCHAR(50) NOT NULL DEFAULT '' COMMENT '服用时间描述',
  note          VARCHAR(255) NULL,
  last_punch_at DATETIME NULL COMMENT '最近打卡时间',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_medicine_user (user_id),
  CONSTRAINT fk_bp_medicine_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 作息打卡（每天一条，当天可修改）
CREATE TABLE IF NOT EXISTS sleep_checkins (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  checkin_date DATE NOT NULL,
  sleep_time   VARCHAR(5) NOT NULL DEFAULT '' COMMENT '入睡时刻 HH:mm',
  wake_time    VARCHAR(5) NOT NULL DEFAULT '' COMMENT '起床时刻 HH:mm',
  nap_time     VARCHAR(5) NOT NULL DEFAULT '' COMMENT '午憩时刻 HH:mm',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sleep_user_date (user_id, checkin_date),
  CONSTRAINT fk_sleep_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 情绪打卡
CREATE TABLE IF NOT EXISTS mood_checkins (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  mood        VARCHAR(20) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mood_user (user_id),
  CONSTRAINT fk_bp_mood_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户收藏（食谱等内容，跟随账号多端同步）
CREATE TABLE IF NOT EXISTS user_favorites (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  fav_type    VARCHAR(20) NOT NULL DEFAULT 'recipe' COMMENT '收藏类型：recipe=食谱',
  target_name VARCHAR(100) NOT NULL COMMENT '收藏对象名称（如食谱名）',
  meta        VARCHAR(255) NOT NULL DEFAULT '' COMMENT '附加信息（餐次/食材等快照）',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fav_user_target (user_id, fav_type, target_name),
  KEY idx_fav_user (user_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 内容数据（种子） ============

-- 穴位库
CREATE TABLE IF NOT EXISTS acupoints (
  id         INT UNSIGNED NOT NULL,
  category   VARCHAR(20) NOT NULL COMMENT 'stress/neck/sleep/office',
  name       VARCHAR(50) NOT NULL,
  tag        VARCHAR(50) NOT NULL DEFAULT '',
  effect     VARCHAR(255) NOT NULL DEFAULT '',
  icon       VARCHAR(16) NOT NULL DEFAULT '',
  location   VARCHAR(255) NOT NULL DEFAULT '',
  method     VARCHAR(255) NOT NULL DEFAULT '',
  duration   VARCHAR(50) NOT NULL DEFAULT '',
  frequency  VARCHAR(50) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 泡脚配方
CREATE TABLE IF NOT EXISTS footbath_recipes (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  herbs      VARCHAR(255) NOT NULL,
  water_temp VARCHAR(20) NOT NULL DEFAULT '',
  duration   VARCHAR(20) NOT NULL DEFAULT '',
  keywords   VARCHAR(255) NOT NULL DEFAULT '' COMMENT '逗号分隔的匹配词',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 功法动作
CREATE TABLE IF NOT EXISTS practice_moves (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  name       VARCHAR(100) NOT NULL,
  duration   VARCHAR(20) NOT NULL DEFAULT '',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 种子数据 ============

-- 演示用户
INSERT INTO users (id, phone, name, score, level)
  SELECT 1, '13800000000', '小松', 62, '轻度肝郁'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 1);

-- 穴位（15 个，分类与前端一致）
INSERT INTO acupoints (id, category, name, tag, effect, icon, location, method, duration, frequency)
SELECT * FROM (
  SELECT 1 AS id,'stress' AS category,'太冲穴' AS name,'疏肝理气' AS tag,'生气后按5分钟，疏解胸闷' AS effect,'🦶' AS icon,'足背侧，第1、2跖骨结合部前方凹陷处' AS location,'拇指按揉，力度以酸胀为度' AS method,'3-5分钟' AS duration,'每日2-3次' AS frequency
  UNION ALL SELECT 2,'stress','期门穴','肝经募穴','胸胁胀痛时按揉3分钟','💬','胸部，第6肋间隙，前正中线旁开4寸','食中指按揉','3分钟','每日1-2次'
  UNION ALL SELECT 3,'stress','阳陵泉','胆经合穴','口苦烦躁时按压5分钟','🌳','小腿外侧，腓骨头前下方凹陷处','拇指点按','5分钟','每日1-2次'
  UNION ALL SELECT 4,'stress','行间穴','清肝泻火','急躁易怒时掐按3分钟','🌱','足背第1、2趾间，趾蹼缘上方纹头处','拇指掐按','3分钟','每日2次'
  UNION ALL SELECT 5,'stress','膻中穴','宽胸理气','胸闷时掌根揉2分钟','🦴','前正中线上，两乳头连线中点','掌根揉按','2分钟','胸闷时随时可用'
  UNION ALL SELECT 6,'stress','合谷穴','通经活络','头痛牙痛时按压3分钟','✊','手背第1、2掌骨间，第2掌骨桡侧中点','拇指对掐','3分钟','每日2-3次'
  UNION ALL SELECT 7,'neck','风池穴','祛风解表','肩颈僵硬时揉按5分钟','🧀','项后枕骨下，斜方肌与胸锁乳突肌之间的凹陷处','双手拇指揉按','5分钟','每日2次'
  UNION ALL SELECT 8,'neck','肩井穴','舒筋活络','久坐肩酸时捏按3分钟','🧘','肩上，大椎与肩峰连线的中点','拿捏肩部','3分钟','每日2-3次'
  UNION ALL SELECT 9,'neck','大椎穴','振奋阳气','怕冷时搓热2分钟','🌕','第7颈椎棘突下凹陷处','掌心搓热','2分钟','怕冷时可用'
  UNION ALL SELECT 10,'sleep','神门穴','安神定志','失眠时按揉3分钟助眠','💤','腕横纹尺侧端，尺侧腕屈肌腱桡侧凹陷处','拇指按揉','3分钟','睡前1次'
  UNION ALL SELECT 11,'sleep','三阴交','滋阴养血','睡前按5分钟改善睡眠','🌷','小腿内侧，内踝尖上3寸，胫骨内侧缘后方','拇指按揉','5分钟','睡前1次（孕妇禁按）'
  UNION ALL SELECT 12,'sleep','涌泉穴','引火归元','搓脚心100下助深度睡眠','🦶','足底前1/3凹陷处，蜷足时凹陷中','掌心搓擦','约3分钟','睡前1次'
  UNION ALL SELECT 13,'office','内关穴','和胃降逆','恶心时按压2分钟','👋','前臂掌侧，腕横纹上2寸，两筋之间','拇指按压','2分钟','不适时随时用'
  UNION ALL SELECT 14,'office','列缺穴','宣肺利窍','头痛时掐按1分钟','🌿','前臂桡侧，腕横纹上1.5寸','拇指掐按','1分钟','头痛时用'
  UNION ALL SELECT 15,'office','后溪穴','舒筋止痛','手腕酸痛时按揉2分钟','💪','第5掌指关节后尺侧，掌横纹头赤白肉际处','按揉','2分钟','久坐时每小时1次'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM acupoints);

-- 泡脚配方
INSERT INTO footbath_recipes (name, herbs, water_temp, duration, keywords, is_default)
SELECT * FROM (
  SELECT '玫瑰疏肝方' AS name,'玫瑰花10g + 柴胡6g + 薄荷5g' AS herbs,'40-42°C' AS water_temp,'20分钟' AS duration,'' AS keywords,1 AS is_default
  UNION ALL SELECT '艾草温通方','艾叶15g + 生姜3片 + 红花5g','38-40°C','15分钟','怕冷,手脚凉',0
  UNION ALL SELECT '合欢安神方','合欢皮10g + 夜交藤15g + 柏子仁5g','40°C','20分钟','失眠,睡不着',0
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM footbath_recipes);

-- 功法动作（八段锦八式）
INSERT INTO practice_moves (sort_order, name, duration)
SELECT * FROM (
  SELECT 1 AS sort_order,'两手托天理三焦' AS name,'30s' AS duration
  UNION ALL SELECT 2,'左右开弓似射雕','30s'
  UNION ALL SELECT 3,'调理脾胃须单举','30s'
  UNION ALL SELECT 4,'五劳七伤往后瞧','30s'
  UNION ALL SELECT 5,'摇头摆尾去心火','30s'
  UNION ALL SELECT 6,'两手攀足固肾腰','30s'
  UNION ALL SELECT 7,'攒拳怒目增气力','30s'
  UNION ALL SELECT 8,'背后七颠百病消','30s'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM practice_moves);

-- 演示症状记录
INSERT INTO symptoms (user_id, symptom, severity, cause, created_at)
SELECT 1, t.symptom, t.severity, t.cause, t.created_at FROM (
  SELECT '胸闷' AS symptom,'轻度' AS severity,'工作压力' AS cause,'2026-09-12 14:30:00' AS created_at
  UNION ALL SELECT '失眠','中度','熬夜刷手机','2026-09-11 23:00:00'
  UNION ALL SELECT '易怒','轻度','会议冲突','2026-09-11 10:00:00'
  UNION ALL SELECT '头痛','轻度','空调直吹','2026-09-10 16:00:00'
) AS t
WHERE NOT EXISTS (SELECT 1 FROM symptoms WHERE user_id = 1);

-- 演示用药提醒
INSERT INTO medicines (user_id, name, dose, med_time, note)
SELECT * FROM (
  SELECT 1 AS user_id,'逍遥丸' AS name,'8粒/次' AS dose,'饭后30分钟' AS med_time,'经期停服' AS note
  UNION ALL SELECT 1,'柴胡疏肝散','1袋/次','早晚饭后','忌辛辣'
  UNION ALL SELECT 1,'归脾丸','10粒/次','睡前1小时','感冒时停服'
  UNION ALL SELECT 1,'玫瑰花茶','5朵/杯','下午3点','孕妇慎用'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM medicines WHERE user_id = 1);

-- 演示待办（当天）
INSERT INTO todos (user_id, content, todo_time, type, is_done, todo_date)
SELECT 1, t.content, t.todo_time, t.type, t.is_done, CURDATE() FROM (
  SELECT '逍遥丸 · 饭后30分钟' AS content,'12:30' AS todo_time,'med' AS type,0 AS is_done
  UNION ALL SELECT '太冲穴按揉5分钟','15:00','ai',0
  UNION ALL SELECT '23点前放下手机','22:30','sleep',0
  UNION ALL SELECT '玫瑰花茶一杯','16:00','diet',1
) AS t
WHERE NOT EXISTS (
  SELECT 1 FROM todos WHERE user_id = 1 AND todo_date = CURDATE()
);
