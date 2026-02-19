-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "thirdPartyInsuranceStart" TIMESTAMP(3),
ADD COLUMN     "thirdPartyInsuranceEnd" TIMESTAMP(3),
ADD COLUMN     "ownInsuranceStart" TIMESTAMP(3),
ADD COLUMN     "ownInsuranceEnd" TIMESTAMP(3);
