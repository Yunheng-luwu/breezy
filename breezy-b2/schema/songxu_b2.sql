-- ========================================================
-- 松序 Breezith b2 业务数据库（简化版）
-- 兼容 MySQL 5.7+ / MariaDB 10.3+
-- 库名: songxu_b2（独立库，不影响 songxu）
--
-- 相比冻结版 songxu 砍掉：
--   - medicines         （用药提醒合并进 symptoms 或砍）
--   - acupoints         （用 public/knowledge/*.json 替代）
--   - footbath_recipes  （用 public/knowledge/*.json 替代）
--   - practice_moves    （用 public/knowledge/*.json 替代）
-- ========================================================

CREATE DATABASE IF NOT EXISTS songxu_b2
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE songxu_b2;

-- ============ 10 张核心表 ============

-- 用户（账号 + AI 兼容字段）
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50) NULL,
  email         VARCHAR(100) NULL,
  password_hash VARCHAR(120) NULL COMMENT 'scrypt:salt:hash 或 bcrypt',
  phone         VARCHAR(20) NULL,
  name          VARCHAR(50) NOT NULL DEFAULT '小松',
  role          VARCHAR(10) NOT NULL DEFAULT 'user' COMMENT 'admin=管理员 user=普通用户',
  score         TINYINT UNSIGNED NULL DEFAULT NULL COMMENT '肝郁指数 0-100（NULL=未测评）',
  level         VARCHAR(20) NULL DEFAULT NULL COMMENT '测评等级（NULL=未测评）',
  avatar        VARCHAR(255) NULL COMMENT '预设 key p1-p10 或上传路径',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_phone (phone),
  UNIQUE KEY uk_username (username),
  UNIQUE KEY uk_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 健康档案
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
  CONSTRAINT fk_hp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 慢病档案（JSON TEXT 兼容 MariaDB 10.3）
CREATE TABLE IF NOT EXISTS chronic_profiles (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  has_disease TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否有已确诊慢病',
  diseases    TEXT NULL COMMENT 'JSON: [{name, years}]',
  has_meds    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否长期服药(3个月以上)',
  meds        TEXT NULL COMMENT 'JSON: [{name, dose}]',
  pregnancy   VARCHAR(12) NOT NULL DEFAULT 'none' COMMENT 'none/trying/pregnant/breastfeeding',
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_chronic_user (user_id),
  CONSTRAINT fk_chronic_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 对话会话
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(100) NOT NULL DEFAULT '新的对话',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 对话消息
CREATE TABLE IF NOT EXISTS chat_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id  BIGINT UNSIGNED NOT NULL,
  role        ENUM('system','user','assistant') NOT NULL,
  content     TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session (session_id),
  CONSTRAINT fk_message_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 待办
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
  KEY idx_user_date (user_id, todo_date),
  CONSTRAINT fk_todo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 症状记录（含用药提醒 note）
CREATE TABLE IF NOT EXISTS symptoms (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  symptom     VARCHAR(50) NOT NULL,
  severity    VARCHAR(20) NOT NULL DEFAULT '轻度',
  cause       VARCHAR(255) NULL,
  note        VARCHAR(255) NULL COMMENT '备注/用药提醒',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  CONSTRAINT fk_symptom_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
  CONSTRAINT fk_medicine_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 作息打卡（每天一条）
CREATE TABLE IF NOT EXISTS sleep_checkins (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  checkin_date DATE NOT NULL,
  sleep_time   VARCHAR(5) NOT NULL DEFAULT '' COMMENT '入睡时刻 HH:mm',
  wake_time    VARCHAR(5) NOT NULL DEFAULT '' COMMENT '起床时刻 HH:mm',
  nap_time     VARCHAR(5) NOT NULL DEFAULT '' COMMENT '午憩时刻 HH:mm',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_date (user_id, checkin_date),
  CONSTRAINT fk_sleep_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 情绪打卡
CREATE TABLE IF NOT EXISTS mood_checkins (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  mood        VARCHAR(20) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id),
  CONSTRAINT fk_mood_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户收藏
CREATE TABLE IF NOT EXISTS user_favorites (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  fav_type    VARCHAR(20) NOT NULL DEFAULT 'recipe' COMMENT 'recipe/acupoint/diet',
  target_name VARCHAR(100) NOT NULL,
  meta        VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_target (user_id, fav_type, target_name),
  KEY idx_user (user_id),
  CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ 种子数据 ============

-- 演示用户小松
INSERT INTO users (id, phone, name, score, level)
  SELECT 1, '13800000000', '小松', 62, '轻度肝郁'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 1);

-- 演示待办（当天）
INSERT INTO todos (user_id, content, todo_time, type, is_done, todo_date)
SELECT 1, t.content, t.todo_time, t.type, t.is_done, CURDATE() FROM (
  SELECT '太冲穴按揉5分钟' AS content, '15:00' AS todo_time, 'ai' AS type, 0 AS is_done
  UNION ALL SELECT '23点前放下手机', '22:30', 'sleep', 0
  UNION ALL SELECT '玫瑰花茶一杯', '16:00', 'diet', 1
) AS t
WHERE NOT EXISTS (
  SELECT 1 FROM todos WHERE user_id = 1 AND todo_date = CURDATE()
);

-- 演示症状
INSERT INTO symptoms (user_id, symptom, severity, cause, note)
SELECT 1, t.symptom, t.severity, t.cause, t.note FROM (
  SELECT '胸闷' AS symptom, '轻度' AS severity, '工作压力' AS cause, '逍遥丸 8粒/次 饭后30分钟' AS note
  UNION ALL SELECT '失眠', '中度', '熬夜刷手机', '归脾丸 10粒/次 睡前1小时'
  UNION ALL SELECT '易怒', '轻度', '会议冲突', '玫瑰花茶 5朵/杯 下午3点'
  UNION ALL SELECT '头痛', '轻度', '空调直吹', ''
) AS t
WHERE NOT EXISTS (SELECT 1 FROM symptoms WHERE user_id = 1);

-- 演示用药提醒
INSERT INTO medicines (user_id, name, dose, med_time, note)
SELECT * FROM (
  SELECT 1 AS user_id, '逍遥丸' AS name, '8粒/次' AS dose, '饭后30分钟' AS med_time, '经期停服' AS note
  UNION ALL SELECT 1, '柴胡疏肝散', '1袋/次', '早晚饭后', '忌辛辣'
  UNION ALL SELECT 1, '归脾丸', '10粒/次', '睡前1小时', '感冒时停服'
  UNION ALL SELECT 1, '玫瑰花茶', '5朵/杯', '下午3点', '孕妇慎用'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM medicines WHERE user_id = 1);

-- 演示健康档案
INSERT INTO health_profiles (user_id, constitution, diet_pref, exercise_pref, sleep_pref, body_sense, wake_time, nap_time, bed_time)
  SELECT 1, '气郁质', '清淡少油，喜温食', '久坐，偶尔拉伸', '熬夜，入睡偏晚', '怕冷', '07:00', '13:00', '23:00'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM health_profiles WHERE user_id = 1);

-- 演示慢病档案（空档案，供 AI 安全提醒演示）
INSERT INTO chronic_profiles (user_id, has_disease, diseases, has_meds, meds, pregnancy)
  SELECT 1, 0, NULL, 0, NULL, 'none'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM chronic_profiles WHERE user_id = 1);

-- 演示账号密码：13800000000 / 123456（bcrypt）
UPDATE users
   SET password_hash = '$2b$10$YaPJ1VWtia0urIpX8Ep3fOeUAsO5QeYIalbilFFWZ2IzcQAINBs1.',
       username = COALESCE(username, 'xiaosong')
 WHERE id = 1 AND (password_hash IS NULL OR password_hash = '');

-- ============ AI 跟练成绩（排行榜） ============

-- AI 跟练成绩（排行榜）
CREATE TABLE IF NOT EXISTS practice_scores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(50) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'baduanjin',
  score INT UNSIGNED NOT NULL DEFAULT 0,
  reps INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cat_score (category, score),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI跟练成绩排行榜';

-- ============ 随手记 ============

-- 随手记（记录页自由笔记）
CREATE TABLE IF NOT EXISTS notes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  content     VARCHAR(500) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, created_at),
  CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='随手记';
