ALTER TABLE channel_connections
  ADD COLUMN provider_cursor INTEGER NOT NULL DEFAULT -1;
