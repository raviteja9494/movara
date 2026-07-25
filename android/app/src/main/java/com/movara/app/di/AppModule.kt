package com.movara.app.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import com.movara.app.BuildConfig
import com.movara.app.data.local.MovaraDao
import com.movara.app.data.local.MovaraDatabase
import com.movara.app.data.network.AuthInterceptor
import com.movara.app.data.network.DynamicServerInterceptor
import com.movara.app.data.network.MovaraApiService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import javax.inject.Qualifier
import javax.inject.Singleton

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PlainHttpClient

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): MovaraDatabase =
        Room.databaseBuilder(context, MovaraDatabase::class.java, "movara_companion_v2.db")
            .fallbackToDestructiveMigration(true)
            .build()

    @Provides
    fun provideDao(database: MovaraDatabase): MovaraDao = database.dao()

    @Provides
    @Singleton
    fun provideDataStore(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create {
            context.preferencesDataStoreFile("movara_settings.preferences_pb")
        }

    @Provides
    @Singleton
    @PlainHttpClient
    fun providePlainHttpClient(): OkHttpClient = OkHttpClient.Builder().build()

    @Provides
    @Singleton
    fun provideOkHttp(
        @PlainHttpClient plainClient: OkHttpClient,
        dynamicServerInterceptor: DynamicServerInterceptor,
        authInterceptor: AuthInterceptor,
    ): OkHttpClient = plainClient.newBuilder()
        .addInterceptor(dynamicServerInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(
            HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
                else HttpLoggingInterceptor.Level.NONE
            }
        )
        .build()

    @Provides
    @Singleton
    fun provideApi(client: OkHttpClient): MovaraApiService =
        Retrofit.Builder()
            .baseUrl(BuildConfig.DEFAULT_SERVER_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(MovaraApiService::class.java)

    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO
}
