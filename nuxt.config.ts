// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2024-11-01',
    modules: ['@vueuse/nuxt', '@nuxtjs/supabase'],
    devtools: {enabled: true},
    css: ['~/assets/css/main.css'],
    ssr: false,
    supabase: {
        redirect: true,
        exclude: ["/login", "/sign_up"],
    },
    nitro: {
        preset: 'cloudflare-pages',
        compatibilityDate: '2024-04-03',
    },
    postcss: {
        plugins: {
            tailwindcss: {},
            autoprefixer: {},
        },
    },
})