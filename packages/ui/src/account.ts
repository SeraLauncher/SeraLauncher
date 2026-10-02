export type AccountType = "microsoft" | "offline";

export type PublicAccount = {
  id: string;
  accountType?: AccountType;
  username: string;
  uuid: string;
  skinUrl?: string | null;
  isActive: boolean;
};

export type DeviceCodeResponse = {
  userCode: string;
  deviceCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
  message: string;
};
