
package com.hhpanda

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*

class HHPandaProvider : MainAPI() {

    override var mainUrl = "https://hhpanda.st"
    override var name = "HHPanda"
    override val hasMainPage = true
    override var lang = "vi"

    override val supportedTypes = setOf(
        TvType.Anime
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val doc = app.get("$mainUrl/page/$page").document

        val items = doc.select(".film_list-wrap .flw-item").map {
            val title = it.select(".film-name a").text()
            val link = mainUrl + it.select(".film-name a").attr("href")
            val poster = it.select("img").attr("data-src")

            newAnimeSearchResponse(title, link) {
                this.posterUrl = poster
            }
        }

        return newHomePageResponse(
            listOf(HomePageList("Anime mới", items))
        )
    }

    override suspend fun search(query: String): List<SearchResponse> {
        val doc = app.get("$mainUrl/search?keyword=$query").document

        return doc.select(".film_list-wrap .flw-item").map {
            val title = it.select(".film-name a").text()
            val href = mainUrl + it.select(".film-name a").attr("href")
            val poster = it.select("img").attr("data-src")

            newAnimeSearchResponse(title, href) {
                this.posterUrl = poster
            }
        }
    }

    override suspend fun load(url: String): LoadResponse {
        val doc = app.get(url).document

        val title = doc.select(".film-name").text()
        val poster = doc.select(".film-poster img").attr("src")
        val description = doc.select(".film-description").text()

        val episodes = doc.select(".ep-item").map {
            val epName = it.text()
            val epUrl = mainUrl + it.attr("href")
            Episode(epUrl, epName)
        }

        return newAnimeLoadResponse(title, url, TvType.Anime) {
            posterUrl = poster
            plot = description
            addEpisodes(DubStatus.Subbed, episodes)
        }
    }

    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {

        val doc = app.get(data).document

        doc.select("iframe").forEach {
            val link = it.attr("src")

            callback.invoke(
                ExtractorLink(
                    "HHPanda",
                    "Server",
                    link,
                    "",
                    Qualities.Unknown.value
                )
            )
        }

        return true
    }
}
