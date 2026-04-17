package main

import (
	"math"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Структура сессии под твой дизайн
type ParkingSession struct {
	ID        uint       `gorm:"primaryKey"`
	CarNumber string     `json:"car_number"`
	CarModel  string     `json:"car_model"` // Марка машины (Toyota и т.д.)
	EntryTime time.Time  `json:"entry_time"`
	ExitTime  *time.Time `json:"exit_time,omitempty"`
	Amount    int        `json:"amount"` // Сумма к оплате
	Status    string     `json:"status"` // "Parked" или "Unparked" (как в дизайне)
}

const TotalSpaces = 50
const PricePerMinute = 5 // Цена в сомах

func main() {
	// Подключение к БД (пароль уже твой)
	dsn := "host=localhost user=postgres password=aktansql dbname=parking_db port=5432 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		panic("Ошибка БД!")
	}

	db.AutoMigrate(&ParkingSession{})

	r := gin.Default()

	// 1. СТАТИСТИКА (Для верхнего блока "Free spaces 23/50")
	r.GET("/stats", func(c *gin.Context) {
		var activeCount int64
		db.Model(&ParkingSession{}).Where("status = ?", "Parked").Count(&activeCount)
		
		freeSpaces := TotalSpaces - int(activeCount)
		c.JSON(http.StatusOK, gin.H{
			"free_spaces":  freeSpaces,
			"total_spaces": TotalSpaces,
		})
	})

	// 2. ВЪЕЗД (Для кнопки Scan/QR)
	r.POST("/entry", func(c *gin.Context) {
		var input struct {
			CarNumber string `json:"car_number"`
			CarModel  string `json:"car_model"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Данные не полные"})
			return
		}

		session := ParkingSession{
			CarNumber: input.CarNumber,
			CarModel:  input.CarModel,
			EntryTime: time.Now(),
			Status:    "Parked",
		}
		db.Create(&session)
		c.JSON(http.StatusOK, session)
	})

	// 3. ВЫЕЗД (Логика кнопки PAY + расчет времени)
	r.POST("/exit", func(c *gin.Context) {
		var input struct {
			CarNumber string `json:"car_number"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Нужен номер"})
			return
		}

		var session ParkingSession
		if err := db.Where("car_number = ? AND status = ?", input.CarNumber, "Parked").First(&session).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Машина не найдена"})
			return
		}

		now := time.Now()
		duration := now.Sub(session.EntryTime).Minutes()
		// Минимум 1 минута оплаты
		if duration < 1 { duration = 1 }
		
		session.ExitTime = &now
		session.Status = "Unparked"
		session.Amount = int(math.Ceil(duration)) * PricePerMinute
		db.Save(&session)

		c.JSON(http.StatusOK, gin.H{
			"message": "Оплачено",
			"amount":  session.Amount,
			"time":    int(duration),
		})
	})

	// 4. ИСТОРИЯ (Для блока "Recent parkings")
	r.GET("/history", func(c *gin.Context) {
		var sessions []ParkingSession
		db.Order("id desc").Limit(10).Find(&sessions)
		c.JSON(http.StatusOK, sessions)
	})

	r.Run(":8080")
}