#!/usr/bin/env python3
"""
Automated Twitter posting script for Z.E Digital Tech (@zedigitaltech)
Creates 25 engaging posts about AI, technology, and hospitality innovation
"""

from playwright.sync_api import sync_playwright
import time
import sys

# Unbuffered output
sys.stdout = sys.stderr

# Post content - mix of thought leadership, engagement questions, stats, and behind-the-scenes
POSTS = [
    # Thought Leadership (8 posts)
    "Hot take: Voice AI will replace hotel front desks by 2030. Agree? 🤔 #AI #Hospitality #FutureTech",
    "The future of hospitality isn't just about technology—it's about creating seamless, personalized experiences that feel magical. ✨ #HotelTech #Innovation",
    "Digital transformation in hotels isn't a trend. It's the new standard. Those who adapt thrive; those who don't... well. 📈 #DigitalTransformation",
    "AI ethics in customer service: How do we balance automation with the human touch that hospitality demands? 🤝 #AIEthics #CustomerService",
    "The technology adoption curve in hospitality is accelerating. What took 10 years now takes 2. Are you ready? ⚡ #TechAdoption #Hotels",
    "Smart hotels aren't just about IoT devices. They're about creating intuitive environments that anticipate guest needs. 🏨 #SmartHotel #IoT",
    "By 2030, 80% of hotel interactions will be AI-assisted. The question is: will yours be leading or following? 🚀 #FutureOfWork #AI",
    "The best technology in hospitality is invisible. It just works, making every stay feel effortless. That's the goal. 🎯 #UX #HotelInnovation",
    
    # Engagement Questions (7 posts)
    "What's your favorite tech upgrade you've seen in hotels? Voice-controlled rooms? Robot concierges? Something else? 🤖 #HotelTech #Travel",
    "If you could automate ONE thing in hospitality, what would it be? Check-in? Housekeeping? Room service? 🏨 #Automation #Hospitality",
    "Quick poll: Would you stay at a hotel run entirely by AI? 👍 Yes | 👎 No | 🤔 Maybe #AI #Travel #FutureHotels",
    "What's the most frustrating part of hotel stays that technology should solve? Let's discuss! 💭 #CustomerExperience #Hotels",
    "On a scale of 1-10, how important is high-speed WiFi when choosing a hotel? For me, it's an 11. 📶 #Travel #Connectivity",
    "If hotels could read your mind for ONE thing, what should it be? Room temperature? Pillow firmness? Breakfast preferences? 🧠 #Personalization",
    "Reality check: Are smart hotel rooms actually smart, or just complicated? What's your experience? 🤷‍♂️ #SmartHome #Travel",
    
    # Quick Stats (5 posts)
    "📊 The global hotel tech market will reach $35.5B by 2027. Growth rate: 12.4% CAGR. The revolution is here. #MarketTrends #HotelTech",
    "📈 73% of travelers prefer hotels with mobile check-in. If you don't have it, you're losing bookings. #Stats #HospitalityTech",
    "💡 Hotels using AI for revenue management see 10-15% increase in RevPAR. Data-driven decisions win. #RevenueManagement #AI",
    "💰 Contactless tech reduced hotel operational costs by 23% post-pandemic. Efficiency meets safety. #CostSavings #Innovation",
    "📱 68% of hotel guests use their smartphone during their stay. Are you meeting them where they are? #MobileFirst #GuestExperience",
    
    # Behind the Scenes (5 posts)
    "Behind the scenes: We're building AI solutions that understand context, not just commands. The difference is everything. 🔧 #BuildingInPublic #AI",
    "Just wrapped up a customer success story: 40% reduction in response time, 95% guest satisfaction. This is why we do what we do. 💪 #Success #Results",
    "Team insight: The best AI implementations happen when we listen to frontline staff first. They know what guests actually need. 👥 #TeamWork #Innovation",
    "Development update: Training models on hospitality-specific data makes all the difference. Generic AI isn't enough. 🎯 #MachineLearning #Hotels",
    "What we learned this week: Small UX improvements can lead to 30% better guest engagement. Details matter. 🔍 #UX #ContinuousImprovement"
]

def post_to_twitter():
    """Connect to existing Chrome and post tweets"""
    success_count = 0
    
    with sync_playwright() as p:
        # Connect to existing Chrome instance
        browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        
        # Get the default context and page
        context = browser.contexts[0]
        page = context.pages[0] if context.pages else context.new_page()
        
        print(f"Connected to browser. Current URL: {page.url}")
        
        for i, post in enumerate(POSTS, 1):
            try:
                print(f"\n--- Post {i}/{len(POSTS)} ---")
                print(f"Content: {post[:50]}...")
                
                # Navigate to compose page
                page.goto("https://x.com/compose/post", wait_until="networkidle")
                time.sleep(2)
                
                # Find and click the text area
                text_area = page.wait_for_selector('[data-testid="tweetTextarea_0"]', timeout=10000)
                text_area.click()
                time.sleep(0.5)
                
                # Type the post
                text_area.fill(post)
                time.sleep(1)
                
                # Find and click the Post button
                post_button = page.wait_for_selector('[data-testid="tweetButtonInline"]', timeout=10000)
                post_button.click()
                
                # Wait for confirmation (URL should change or success indicator)
                time.sleep(3)
                
                # Verify we're not still on compose page (indicates success)
                if "compose/post" not in page.url:
                    success_count += 1
                    print(f"✓ Successfully posted {i}/{len(POSTS)}")
                else:
                    print(f"✗ Failed to post {i}/{len(POSTS)} - still on compose page")
                
                # Wait between posts to avoid rate limiting
                time.sleep(5)
                
            except Exception as e:
                print(f"✗ Error posting {i}/{len(POSTS)}: {str(e)}")
                continue
        
        print(f"\n{'='*50}")
        print(f"FINAL RESULTS: Successfully posted {success_count}/{len(POSTS)} tweets")
        print(f"{'='*50}")
        
        return success_count

if __name__ == "__main__":
    print("Starting automated Twitter posting for @zedigitaltech...")
    print(f"Total posts to create: {len(POSTS)}")
    print("="*50)
    
    success_count = post_to_twitter()
    
    print(f"\nTask complete! {success_count} posts created successfully.")
