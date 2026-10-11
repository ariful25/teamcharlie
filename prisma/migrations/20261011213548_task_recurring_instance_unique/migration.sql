-- CreateIndex
CREATE UNIQUE INDEX "Task_recurringTemplateId_date_key" ON "Task"("recurringTemplateId", "date");
