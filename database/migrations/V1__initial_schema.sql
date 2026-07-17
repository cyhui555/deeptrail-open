-- Flyway V1：初始化 SQLite 基础结构；后续字段统一由版本化迁移追加。
-- Itinerary record table
CREATE TABLE IF NOT EXISTS itinerary_record (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    departure_location  VARCHAR(100) NOT NULL,
    departure_time      TIMESTAMP    NOT NULL,
    destination         VARCHAR(100) NOT NULL,
    days                INT          NOT NULL,
    people_count        INT          NOT NULL,
    budget              VARCHAR(50)  NULL,
    preferences         VARCHAR(500) NULL,
    special_requirements VARCHAR(500) NULL,
    result_json         TEXT         NULL,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- AI call log table
CREATE TABLE IF NOT EXISTS ai_call_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    call_type       VARCHAR(20)  NOT NULL,
    request_summary VARCHAR(500) NULL,
    response_status VARCHAR(20)  NOT NULL,
    token_used      INT          NULL,
    duration_ms     INT          NULL,
    task_id         VARCHAR(36)  NULL,
    user_id         INTEGER      NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Async task table
CREATE TABLE IF NOT EXISTS itinerary_task (
    id            VARCHAR(36) PRIMARY KEY,
    type          VARCHAR(20)  NOT NULL,
    status        VARCHAR(20)  NOT NULL,
    request_json  TEXT         NOT NULL,
    result_json   TEXT         NULL,
    error_message  VARCHAR(500) NULL,
    parsed_content TEXT         NULL,
    user_id       INTEGER      NOT NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    started_at    TIMESTAMP    NULL,
    completed_at  TIMESTAMP    NULL,
    expires_at    TIMESTAMP    NULL,
    retry_count   INT          DEFAULT 0
);

-- User table
CREATE TABLE IF NOT EXISTS user (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        VARCHAR(50)  UNIQUE,
    password        VARCHAR(200),
    phone           VARCHAR(20)  UNIQUE,
    wechat_open_id  VARCHAR(100) UNIQUE,
    wechat_union_id VARCHAR(100),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username ON user(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone ON user(phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wechat_open_id ON user(wechat_open_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_itinerary_destination ON itinerary_record(destination);
CREATE INDEX IF NOT EXISTS idx_itinerary_created     ON itinerary_record(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_call_type          ON ai_call_log(call_type);
CREATE INDEX IF NOT EXISTS idx_ai_call_created       ON ai_call_log(created_at);
CREATE INDEX IF NOT EXISTS idx_task_status           ON itinerary_task(status);
CREATE INDEX IF NOT EXISTS idx_task_created          ON itinerary_task(created_at);
CREATE INDEX IF NOT EXISTS idx_task_user_id          ON itinerary_task(user_id);

-- ============================================
-- 行程清单：用户的出行计划
-- ============================================
CREATE TABLE IF NOT EXISTS trip_plan (
    id              VARCHAR(36) PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    title           VARCHAR(200) NOT NULL,
    destination     VARCHAR(100),
    cover_image     VARCHAR(500),
    planned_date    VARCHAR(10),
    trip_dates      TEXT,
    summary         TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    active_task_id  VARCHAR(36),
    note            TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP,
    deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trip_plan_user_id ON trip_plan(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_plan_status ON trip_plan(status);
CREATE INDEX IF NOT EXISTS idx_trip_plan_user_status ON trip_plan(user_id, status);

-- ============================================
-- 行程清单与生成任务的关联（1:N）
-- ============================================
CREATE TABLE IF NOT EXISTS plan_task_ref (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         VARCHAR(36) NOT NULL,
    task_id         VARCHAR(36) NOT NULL,
    is_active       BOOLEAN DEFAULT FALSE,
    added_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plan_task_ref_plan_id ON plan_task_ref(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_task_ref_task_id ON plan_task_ref(task_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_task_ref_active
    ON plan_task_ref(plan_id, is_active) WHERE is_active = TRUE;

-- ============================================
-- 打卡任务：从某个生成任务按天创建
-- ============================================
CREATE TABLE IF NOT EXISTS checkin_task (
    id              VARCHAR(36) PRIMARY KEY,
    plan_id         VARCHAR(36) NOT NULL,
    task_id         VARCHAR(36) NOT NULL,
    user_id         INTEGER NOT NULL,
    itinerary_date  VARCHAR(10),
    day_number      INT,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    total_poi       INT NOT NULL DEFAULT 0,
    completed_poi   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkin_task_plan_id ON checkin_task(plan_id);
CREATE INDEX IF NOT EXISTS idx_checkin_task_task_id ON checkin_task(task_id);
CREATE INDEX IF NOT EXISTS idx_checkin_task_user_id ON checkin_task(user_id);
CREATE INDEX IF NOT EXISTS idx_checkin_task_plan_day ON checkin_task(plan_id, day_number);

-- ============================================
-- 打卡记录：每个 POI 的打卡详情
-- ============================================
CREATE TABLE IF NOT EXISTS checkin_item (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    checkin_task_id VARCHAR(36) NOT NULL,
    poi_name        VARCHAR(200) NOT NULL,
    poi_address     VARCHAR(500),
    poi_lat         DOUBLE,
    poi_lng         DOUBLE,
    checkin_lat     DOUBLE,
    checkin_lng     DOUBLE,
    distance_meters INT,
    source          VARCHAR(10) NOT NULL DEFAULT 'GPS',
    note            TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    checked_in_at   TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- v0.6.0: 用户修正后的坐标（NULL 表示未修正，展示时用 COALESCE(corrected_lat, poi_lat)）
    corrected_lat   DOUBLE,
    corrected_lng   DOUBLE,
    -- v0.7.0: 当前 POI → 下一 POI 的交通段 JSON（mode/durationMin/description），最后一个 POI 为 NULL
    transport_to_next VARCHAR(500) DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkin_item_task_id ON checkin_item(checkin_task_id);
CREATE INDEX IF NOT EXISTS idx_checkin_item_status ON checkin_item(status);

-- ============================================
-- 打卡媒体：照片/视频
-- ============================================
CREATE TABLE IF NOT EXISTS checkin_media (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    checkin_item_id INTEGER NOT NULL,
    media_type      VARCHAR(10) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,
    file_size       INT,
    thumbnail_path  VARCHAR(500),
    is_history      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_checkin_media_item_id ON checkin_media(checkin_item_id);

-- ============================================
-- 轨迹点：GPS 记录
-- ============================================
CREATE TABLE IF NOT EXISTS track_point (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         VARCHAR(36) NOT NULL,
    latitude        DOUBLE NOT NULL,
    longitude       DOUBLE NOT NULL,
    accuracy        DOUBLE,
    altitude        DOUBLE,
    speed           DOUBLE,
    recorded_at     TIMESTAMP NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_track_point_plan_id ON track_point(plan_id);
CREATE INDEX IF NOT EXISTS idx_track_point_recorded_at ON track_point(recorded_at);
CREATE INDEX IF NOT EXISTS idx_track_point_plan_recorded ON track_point(plan_id, recorded_at);

-- ============================================
-- 旅程评价：每个行程清单对应唯一一份评价
-- ============================================
CREATE TABLE IF NOT EXISTS journey_review (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id         VARCHAR(36) NOT NULL,
    user_id         INTEGER NOT NULL,
    rating          INT NOT NULL,
    user_comment    TEXT,
    ai_summary      TEXT,
    ai_summary_status VARCHAR(20) DEFAULT 'PENDING',
    summary_edited  BOOLEAN DEFAULT FALSE,
    poi_coverage    VARCHAR(50),
    total_distance_meters INT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_review_plan_id ON journey_review(plan_id);
CREATE INDEX IF NOT EXISTS idx_journey_review_user_id ON journey_review(user_id);

-- ============================================
-- 地理编码缓存：记录 POI 名称+地址 → 高德/Nominatim 反查结果
-- ============================================
-- 主路径为 DB 优先:GeocodingServiceImpl.geocode() 先查本表,
-- 命中且未过期则直接返回,不调外部 API;未命中则调高德/Nominatim 并写库。
-- cache_key 格式与 GeocodingServiceImpl.buildCacheKey 一致: "name|region|address"
-- TTL 通过 expire_at 字段控制,业务层读取 application.yml → app.geocoding.cache-expire-minutes
-- ============================================
CREATE TABLE IF NOT EXISTS geocoding_cache (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key     VARCHAR(512) NOT NULL UNIQUE,
    name          VARCHAR(200) NOT NULL,
    address       VARCHAR(500),
    region        VARCHAR(100),
    latitude      DOUBLE       NOT NULL,
    longitude     DOUBLE       NOT NULL,
    level         VARCHAR(50),
    provider      VARCHAR(20)  NOT NULL,
    province      VARCHAR(100),
    city          VARCHAR(100),
    district      VARCHAR(100),
    destination   VARCHAR(200),
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    expire_at     TIMESTAMP    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gc_expire     ON geocoding_cache(expire_at);
CREATE INDEX IF NOT EXISTS idx_gc_name       ON geocoding_cache(name);
CREATE INDEX IF NOT EXISTS idx_gc_name_dest  ON geocoding_cache(name, destination);

-- ============================================
-- 行程预览节点修正：用户按 POI 粒度覆盖 AI 输出的坐标与交通衔接
-- ============================================
-- 复合唯一键 (task_id, day_index, item_index) 保证每 POI 只保留一份修正；
-- 多次修正覆盖同一行并刷新 updated_at。original_json 存修正前快照用于审计。
-- ============================================
CREATE TABLE IF NOT EXISTS itinerary_node_revision (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id            VARCHAR(36)  NOT NULL,
    day_index          INT          NOT NULL,
    item_index         INT          NOT NULL,
    corrected_lat      DOUBLE,
    corrected_lng      DOUBLE,
    transport_mode     VARCHAR(20),
    transport_duration INT,
    transport_desc     VARCHAR(500),
    original_json      TEXT         NOT NULL,
    user_id            INTEGER      NOT NULL,
    created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inr_task_day_item
    ON itinerary_node_revision(task_id, day_index, item_index);
CREATE INDEX IF NOT EXISTS idx_inr_task_id ON itinerary_node_revision(task_id);
