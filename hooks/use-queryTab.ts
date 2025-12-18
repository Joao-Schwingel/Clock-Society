"use client"

import { useEffect, useState, startTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export function useTabWithQuery(
  key: string,
  defaultValue: string
) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // 1. Estado local = imediato
  const [tab, setTab] = useState(() => {
    return searchParams.get(key) ?? defaultValue
  })

  // 2. Sincroniza URL depois (não bloqueia UI)
  useEffect(() => {
    const current = searchParams.get(key)
    if (current === tab) return

    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(key, tab)
      router.replace(`?${params.toString()}`, { scroll: false })
    })
  }, [tab])

  return {
    tab,
    setTab,
  }
}
