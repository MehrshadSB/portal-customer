-- Provision isolated test database alongside primary development database
SELECT 'CREATE DATABASE portal_test OWNER portal'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'portal_test')\gexec
