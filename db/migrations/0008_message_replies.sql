-- Lets an admin reply to a contact-form message (emailed to the sender) and
-- see afterward that it's been handled, instead of only having a mailto:
-- link with no record of whether anyone actually followed up.
ALTER TABLE messages ADD COLUMN reply TEXT;
ALTER TABLE messages ADD COLUMN replied_at TIMESTAMPTZ;
