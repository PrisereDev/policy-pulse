import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    const user = await currentUser();
    
    if (!userId || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    return NextResponse.json({
      id: userId,
      email: user.emailAddresses[0]?.emailAddress,
      name: user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.lastName || null,
      company_name: null, // TODO: Get from user metadata if needed
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      analysis_stats: {
        total_analyses: 0, // TODO: Implement when we have database
        completed_analyses: 0,
        failed_analyses: 0
      }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return NextResponse.json(
      { error: 'Failed to get user profile' }, 
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    // TODO: Implement user profile update when we have database
    const body = await request.json();
    
    return NextResponse.json({
      message: 'Profile updated successfully',
      // For now, just echo back the update
      ...body
    });
  } catch (error) {
    console.error('Update user profile error:', error);
    return NextResponse.json(
      { error: 'Failed to update user profile' }, 
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    // Stub only: real account deletion is performed in Clerk (User profile / delete account).
    // The FastAPI backend exposes DELETE /v1/auth/me for the Postgres user row; the app does not
    // call this Next route for production deletion today.
    return NextResponse.json({
      message: 'Account deletion initiated',
      user_id: userId
    });
  } catch (error) {
    console.error('Delete user account error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' }, 
      { status: 500 }
    );
  }
}