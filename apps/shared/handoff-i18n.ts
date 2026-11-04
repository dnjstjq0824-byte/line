import ko from './strings/ko.json'
import en from './strings/en.json'
import design from './strings/design-v2.json'
const resources: Record<string, Record<string, string>> = { ko, en }
// Preserve LN5 S6 keys and resource contents; existing application keys stay compatible.
const aliases: Record<string, string> = {
  signInBtn:'login_btn', createAccount:'login_create', findPassword:'login_find',
  passwordPlaceholder:'login_pw_ph', namePlaceholder:'su_name_ph',
  navChats:'hd_chats', navFriends:'hd_friends', navSettings:'hd_settings',
  signUpBtn:'hd_signup', profileTitle:'hd_profile',
  profileEdit:'prof_edit', profileChat:'prof_chat', profileVoice:'prof_voice', profileVideo:'prof_video',
}
export function handoffText(locale: string, key: string): string | undefined {
  const canonical = aliases[key] || key
  const language = locale === 'ko' ? 'ko' : 'en'
  const additions: Record<string, string> = design[language]
  return additions[key] || (resources[language] || resources.en)[canonical]
}
