import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  // Fetch user's companies
  const { data: companies } = await supabase.from("companies").select("*").eq("user_id", user.id).order("code")

  // If no companies exist, create the default three companies
  if (!companies || companies.length === 0) {
    await supabase.from("companies").insert([
      { name: "Clock Society", code: "A", user_id: user.id },
      { name: "The Secret", code: "B", user_id: user.id },
      { name: "Morfeus", code: "C", user_id: user.id },
    ])

    // Refetch companies
    const { data: newCompanies } = await supabase.from("companies").select("*").eq("user_id", user.id).order("code")

    return <DashboardLayout companies={newCompanies!} user={user} />
  }

  return <DashboardLayout companies={companies} user={user} />
}
