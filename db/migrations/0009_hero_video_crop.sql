-- Lets the admin reposition/zoom the homepage hero video within its fixed
-- 4:5 banner frame (a CSS object-position + scale crop, not a re-encode —
-- there's no video-processing library in this stack) instead of being stuck
-- with whatever framing the raw upload happens to have.
ALTER TABLE site_settings ADD COLUMN hero_video_position_x INTEGER NOT NULL DEFAULT 50;
ALTER TABLE site_settings ADD COLUMN hero_video_position_y INTEGER NOT NULL DEFAULT 50;
ALTER TABLE site_settings ADD COLUMN hero_video_zoom NUMERIC(3,2) NOT NULL DEFAULT 1;
