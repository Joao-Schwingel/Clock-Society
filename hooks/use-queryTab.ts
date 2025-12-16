"use client"

import { useRouter, useSearchParams } from "next/navigation"

export function useQueryTab(
  key: string,
  defaultValue: string
) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const value = searchParams.get(key) ?? defaultValue

  function setValue(newValue: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, newValue)

    router.replace(`?${params.toString()}`, {
      scroll: false,
    })
  }

  return {
    value,
    setValue,
  }
}
