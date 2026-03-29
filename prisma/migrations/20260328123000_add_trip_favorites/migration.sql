ALTER TABLE "Trip"
ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Trip_favorite_idx" ON "Trip"("favorite");
