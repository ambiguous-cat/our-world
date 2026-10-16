ALTER TABLE `ticket_types` ADD `display_icon` text DEFAULT 'ticket' NOT NULL;
--> statement-breakpoint
UPDATE `ticket_types` SET `display_icon` = 'moon' WHERE `kind` = 'limited';
