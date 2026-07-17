import { redirect } from 'next/navigation';

/** 公开注册已关闭，保留旧地址只用于安全跳转。 */
export default function RegisterPage() {
  redirect('/login');
}
