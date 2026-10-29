/**
 * 安全护栏：调用大模型前做规则预检
 * - 急症红旗：直接给就医指引
 * - 处方药调整：拒绝越权
 * - 自伤倾向：危机干预
 * 对应冻结版 server/agent/safety.js
 */

const EMERGENCY_PATTERNS = [
  /(胸口|心口|胸前|胸).{0,10}(剧痛|绞痛|压榨|闷痛|剧烈疼痛)/,
  /(剧痛|绞痛|冷汗|大汗).{0,10}(胸口|心口|胸前)/,
  /(心梗|心肌梗死|心绞痛发作|中风|脑梗|脑出血)/,
  /胸痛.{0,6}(放射|后背|左臂|左肩|大汗|压榨)/,
  /(喘不上气|呼吸困难|嘴唇发紫|意识模糊|晕倒|昏厥)/,
  /(突然).{0,4}(剧烈头痛|头痛欲裂)/,
  /(一侧|半边).{0,4}(手脚无力|麻木|口角歪斜|说话不清)/,
  /(呕血|咳血|大量出血)/,
];

const SELF_HARM_PATTERNS = [/(不想活|活着没意思|想自杀|想死|结束生命|自残)/];

const MEDICATION_PATTERNS = [
  /(停(药|用|了|掉)|换药|加量|减量|少吃|多吃|调整剂量).{0,12}(逍遥丸|柴胡|归脾丸|药|丸|胶囊|颗粒)/,
  /(逍遥丸|柴胡疏肝散|归脾丸|药|丸|胶囊|颗粒).{0,12}(停(药|用|了|掉)|换药|加量|减量|不吃)/,
  /(自行|自己).{0,4}(停|换|减|加).{0,8}(药|丸|胶囊|颗粒)/,
];

export type SafetyLevel = "normal" | "self_harm" | "emergency" | "medication";

export interface SafetyResult {
  level: SafetyLevel;
  reply?: string;
}

export function detectSafety(text: string): SafetyResult {
  if (SELF_HARM_PATTERNS.some((re) => re.test(text))) {
    return {
      level: "self_harm",
      reply:
        "我很担心你现在的安全。你此刻的痛苦是真实的，但它不是无解的。请马上拨打全国心理援助热线 12356，会有人 24 小时陪你说话；如果有立即伤害自己的冲动，请立刻拨打 120 或去最近医院的急诊，并联系身边一位信任的人陪着你。",
    };
  }

  if (EMERGENCY_PATTERNS.some((re) => re.test(text))) {
    return {
      level: "emergency",
      reply:
        "你描述的情况可能不只是普通的气滞不适，存在急症风险。请立刻停止自行调理，尽快前往最近医院急诊或拨打 120；如果身边有人，请让家人或朋友陪同就医。",
    };
  }

  if (MEDICATION_PATTERNS.some((re) => re.test(text))) {
    return {
      level: "medication",
      reply:
        "关于停药、换药或调整剂量，我不能替医生做决定，因为每个人的体质和病情不同，自行调整可能加重症状或引起不适。请联系给你开方的医生或药师确认后再调整，期间请按原医嘱规律服药、清淡饮食、避免熬夜。",
    };
  }

  return { level: "normal" };
}
