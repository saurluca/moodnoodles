// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2024-11-01',
    modules: ['@vueuse/nuxt', '@nuxtjs/supabase', '@nuxthub/core'],
    devtools: {enabled: true},
    css: ['~/assets/css/main.css'],
    ssr: false,
    supabase: {
        redirect: true,
        exclude: ["/login", "/sign_up"],
    },

    postcss: {
        plugins: {
            tailwindcss: {},
            autoprefixer: {},
        },
    },
})